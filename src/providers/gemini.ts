import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentParameters,
  type GenerateContentResponse,
  type ListModelsParameters,
  type Model,
  type Pager,
  type ThinkingConfig,
} from "@google/genai";
import { LIMITS, type Effort } from "../config/models";
import { getGeminiApiKey } from "../config/env";
import type { CallResult, UsageRecord } from "../core/types";
import { CallProvider, RefusalError, Semaphore, describeError, logRetry, safeCost, sleep, type CallOptions } from "./shared";

/** The part of the SDK client this provider uses; tests pass a stand-in. */
export interface GeminiClient {
  models: {
    generateContentStream(params: GenerateContentParameters): Promise<AsyncGenerator<GenerateContentResponse>>;
    list(params?: ListModelsParameters): Promise<Pager<Model>>;
  };
}

export interface GeminiProviderOptions {
  client?: GeminiClient;
  /** Base delay for exponential backoff; tests set it to 0. */
  backoffBaseMs?: number;
}

/** Finish reasons that mean the model (or Google's filters) declined to answer. */
const REFUSALS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 408 || err.status === 429 || err.status >= 500;
  return err instanceof TypeError; // fetch failed: connection reset, DNS, …
}

/**
 * Gemini 3 models take a thinking level; the member's effort maps onto it. Gemini 2.x models take a token budget
 * instead, so they get a dynamic one.
 */
export function thinkingFor(model: string, effort: Effort): ThinkingConfig {
  if (/^gemini-[12]\./.test(model)) return { thinkingBudget: -1 };
  if (effort === "low") return { thinkingLevel: ThinkingLevel.LOW };
  if (effort === "medium") return { thinkingLevel: ThinkingLevel.MEDIUM };
  return { thinkingLevel: ThinkingLevel.HIGH };
}

/** Structured output takes standard JSON Schema; drop `additionalProperties`, which not every model accepts. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === "object") {
    return Object.fromEntries(
      Object.entries(schema)
        .filter(([k]) => k !== "additionalProperties")
        .map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  return schema;
}

/** Answer text of a streamed chunk, without the model's thoughts. */
function chunkText(chunk: GenerateContentResponse): string {
  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text!)
    .join("");
}

interface StreamResult {
  text: string;
  finishReason: string | null;
  blockReason: string | null;
  usage: GenerateContentResponse["usageMetadata"];
}

/**
 * Gemini through the Gemini Developer API. The same prompts as Claude: the shared blocks (brief, then the debate so
 * far) open the system instruction, so the members of a round share a prefix that Gemini caches implicitly.
 */
export class GeminiProvider extends CallProvider {
  private readonly client: GeminiClient;
  private readonly gate = new Semaphore(LIMITS.maxConcurrentRequests);
  private readonly backoffBaseMs: number;
  /** Models that rejected the thinking setting; they are called with the model's default instead. */
  private readonly noThinkingConfig = new Set<string>();

  constructor(opts: GeminiProviderOptions = {}) {
    super();
    this.client = opts.client ?? new GoogleGenAI({ apiKey: getGeminiApiKey() });
    this.backoffBaseMs = opts.backoffBaseMs ?? 1000;
  }

  protected async call<T>(opts: CallOptions, parse: (text: string) => T): Promise<CallResult<T>> {
    const usage: UsageRecord[] = [];
    let maxTokens = opts.maxTokens;
    let lastError: unknown;

    for (let attempt = 0; attempt < LIMITS.maxAttempts; attempt++) {
      try {
        opts.onStatus?.({ kind: "queued" });
        const r = await this.gate.run(() => {
          opts.onStatus?.({ kind: "started" });
          return this.stream(opts, maxTokens);
        });
        usage.push(this.toUsage(r, opts));

        if (r.blockReason) throw new RefusalError(r.blockReason);
        if (r.finishReason && REFUSALS.has(r.finishReason)) throw new RefusalError(r.finishReason);
        if (r.finishReason === "MAX_TOKENS") {
          if (maxTokens >= 64_000) throw new Error("Response hit max_tokens even after raising the limit");
          maxTokens = Math.min(maxTokens * 2, 64_000); // thinking shares the budget; give it room and try again
          lastError = new Error("max_tokens");
          continue;
        }
        if (!r.text.trim()) throw new Error(`Gemini returned no text (finish reason: ${r.finishReason ?? "none"})`);
        return { value: parse(r.text), usage };
      } catch (err) {
        if (err instanceof RefusalError) throw err;
        lastError = err;
        // An unsupported thinking setting for this model: call it again without one.
        if (err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message) && !this.noThinkingConfig.has(opts.seat.model)) {
          this.noThinkingConfig.add(opts.seat.model);
          continue;
        }
        if (!isRetryable(err)) throw err;
        if (attempt + 1 >= LIMITS.maxAttempts) break;
        const wait = this.backoffBaseMs * 2 ** attempt * (0.5 + Math.random());
        const reason = describeError(err);
        logRetry("Gemini", opts, reason, wait, attempt + 1, LIMITS.maxAttempts);
        opts.onStatus?.({ kind: "retrying", reason, waitMs: wait, attempt: attempt + 1, maxAttempts: LIMITS.maxAttempts });
        await sleep(wait);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Gemini call failed after retries");
  }

  private async stream(opts: CallOptions, maxTokens: number): Promise<StreamResult> {
    const model = opts.seat.model;
    // No temperature: Gemini 3 is meant to run at its default.
    const stream = await this.client.models.generateContentStream({
      model,
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      config: {
        systemInstruction: { parts: [...opts.cached, opts.system].map((text) => ({ text })) },
        maxOutputTokens: maxTokens,
        ...(this.noThinkingConfig.has(model) ? {} : { thinkingConfig: thinkingFor(model, opts.seat.effort) }),
        ...(opts.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: toGeminiSchema(opts.jsonSchema) } : {}),
      },
    });
    const result: StreamResult = { text: "", finishReason: null, blockReason: null, usage: undefined };
    for await (const chunk of stream) {
      const delta = chunkText(chunk);
      if (delta) {
        result.text += delta;
        opts.onText?.(delta);
      }
      result.finishReason = chunk.candidates?.[0]?.finishReason ?? result.finishReason;
      result.blockReason = chunk.promptFeedback?.blockReason ?? result.blockReason;
      result.usage = chunk.usageMetadata ?? result.usage;
    }
    return result;
  }

  private toUsage(r: StreamResult, opts: CallOptions): UsageRecord {
    const u = r.usage ?? {};
    const cached = u.cachedContentTokenCount ?? 0;
    const counts = {
      // promptTokenCount includes the cached part, which is billed at the cache price instead.
      inputTokens: Math.max(0, (u.promptTokenCount ?? 0) - cached),
      // Thinking is billed as output.
      outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
    };
    const model = opts.seat.model;
    return {
      stage: opts.stage,
      advisorId: opts.advisorId,
      round: opts.round,
      model,
      ...counts,
      costUsd: safeCost(model, counts),
      stopReason: r.finishReason ? r.finishReason.toLowerCase() : null,
      fellBack: false,
    };
  }
}

export interface GeminiModelInfo {
  id: string;
  label: string;
}

/** Families the debate cannot use: images, audio, live, embeddings and the like. */
const NOT_FOR_TEXT = /(image|imagen|veo|tts|audio|live|embedding|aqa|robotics|computer-use|lyria|learnlm|gemma)/i;

/**
 * Text models this key can call, newest first. Also the key check: it throws when the key is missing or rejected.
 */
export async function listGeminiModels(client?: GeminiClient): Promise<GeminiModelInfo[]> {
  const c = client ?? new GoogleGenAI({ apiKey: getGeminiApiKey() });
  let pager: Pager<Model>;
  try {
    pager = await c.models.list({ config: { pageSize: 100 } });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 401 || err.status === 403)) {
      throw new Error("Google avvisade Gemini-nyckeln. Skapa en nyckel på aistudio.google.com/apikey och lägg den i GEMINI_API_KEY.", {
        cause: err,
      });
    }
    throw err;
  }
  const out: GeminiModelInfo[] = [];
  for await (const m of pager) {
    const id = (m.name ?? "").replace(/^models\//, "");
    if (!id.startsWith("gemini-") || NOT_FOR_TEXT.test(id)) continue;
    if (m.supportedActions && !m.supportedActions.includes("generateContent")) continue;
    out.push({ id, label: m.displayName || id });
  }
  return out.sort(compareGemini);
}

/** Newest version first; within a version Pro, then Flash, then Flash-Lite; "-latest" aliases and dated builds last. */
export function compareGemini(a: GeminiModelInfo, b: GeminiModelInfo): number {
  const version = (id: string) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  const tier = (id: string) => (/flash-lite/.test(id) ? 2 : /flash/.test(id) ? 1 : /pro/.test(id) ? 0 : 3);
  const noise = (id: string) => (/latest|\d{2}-\d{2}|exp/.test(id) ? 1 : 0);
  return version(b.id) - version(a.id) || tier(a.id) - tier(b.id) || noise(a.id) - noise(b.id) || a.id.localeCompare(b.id);
}
