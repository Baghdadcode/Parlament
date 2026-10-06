import { Mistral } from "@mistralai/mistralai";
import type { ChatCompletionStreamRequest, CompletionEvent, ModelList, ReasoningEffort } from "@mistralai/mistralai/models/components";
import { ConnectionError, MistralError, RequestTimeoutError } from "@mistralai/mistralai/models/errors";
import { LIMITS, modelLabel, type Effort } from "../config/models";
import { getMistralApiKey, mistralTier } from "../config/env";
import type { CallResult, UsageRecord } from "../core/types";
import { CallProvider, Pacer, Semaphore, describeError, logRetry, safeCost, sleep, type CallOptions } from "./shared";

/** The part of the SDK client this provider uses; tests pass a stand-in. */
export interface MistralClient {
  chat: {
    stream(request: ChatCompletionStreamRequest, options?: { fetchOptions?: { signal?: AbortSignal } }): Promise<AsyncIterable<CompletionEvent>>;
  };
  models: { list(): Promise<ModelList> };
}

export interface MistralProviderOptions {
  client?: MistralClient;
  /** Base delay for exponential backoff; tests set it to 0. */
  backoffBaseMs?: number;
  /** Minimum gap between request starts (the free tier allows about one request per second). */
  minIntervalMs?: number;
  maxConcurrent?: number;
  maxAttempts?: number;
  /** Abort and retry a stream that sends nothing for this long. */
  stallTimeoutMs?: number;
}

/** A reasoning model streams its thinking continuously, so this much silence means the connection has stalled. */
const STALL_TIMEOUT_MS = 90_000;

class StallError extends Error {
  constructor(ms: number) {
    super(`Mistral skickade inget på ${Math.round(ms / 1000)} s`);
    this.name = "StallError";
  }
}

/** Pacing defaults per plan; MISTRAL_MIN_INTERVAL_MS and MISTRAL_MAX_CONCURRENT override them. */
export function mistralPacing(): { minIntervalMs: number; maxConcurrent: number; maxAttempts: number } {
  const free = mistralTier() === "free";
  const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    minIntervalMs: num(process.env.MISTRAL_MIN_INTERVAL_MS, free ? 1100 : 0),
    maxConcurrent: Math.max(1, num(process.env.MISTRAL_MAX_CONCURRENT, free ? 3 : LIMITS.maxConcurrentRequests)),
    // The free tier answers bursts with 429s; be more patient there.
    maxAttempts: free ? 8 : LIMITS.maxAttempts,
  };
}

function isRetryable(err: unknown): boolean {
  if (err instanceof MistralError) return err.statusCode === 408 || err.statusCode === 429 || err.statusCode >= 500;
  return err instanceof ConnectionError || err instanceof RequestTimeoutError || err instanceof StallError;
}

const isRateLimit = (err: unknown) => err instanceof MistralError && err.statusCode === 429;

function retryAfterMs(err: unknown): number | null {
  if (!(err instanceof MistralError)) return null;
  const secs = Number(err.headers?.get?.("retry-after"));
  return Number.isFinite(secs) && secs > 0 ? secs * 1000 : null;
}

/** The member's effort as Mistral's reasoning effort (used by reasoning-capable models). */
export function reasoningFor(effort: Effort): ReasoningEffort {
  return effort === "max" ? "xhigh" : effort;
}

/** Answer text of a streamed delta: plain text, or the text chunks of a reasoning model (its thinking is left out). */
function deltaText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: "text"; text: string } => !!c && typeof c === "object" && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

const hasThinking = (content: unknown) => Array.isArray(content) && content.some((c) => !!c && typeof c === "object" && c.type === "thinking");

interface StreamResult {
  text: string;
  finishReason: string | null;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Mistral through La Plateforme. The same prompts as the other providers: one system message that opens with the
 * shared blocks (brief, then the debate so far), then the persona and task. On the free tier, requests are paced to
 * stay under its per-second limit, so a sitting takes longer but does not fail on rate limits.
 */
export class MistralProvider extends CallProvider {
  private readonly client: MistralClient;
  private readonly gate: Semaphore;
  private readonly pacer: Pacer;
  private readonly backoffBaseMs: number;
  private readonly maxAttempts: number;
  private readonly baseConcurrency: number;
  private readonly stallTimeoutMs: number;
  /** Models that rejected the reasoning setting; they are called without it. */
  private readonly noReasoning = new Set<string>();

  constructor(opts: MistralProviderOptions = {}) {
    super();
    const pacing = mistralPacing();
    // The SDK's own retries are off by default; retries (with Retry-After) are handled below.
    this.client = opts.client ?? new Mistral({ apiKey: getMistralApiKey() });
    this.baseConcurrency = opts.maxConcurrent ?? pacing.maxConcurrent;
    this.gate = new Semaphore(this.baseConcurrency);
    this.pacer = new Pacer(opts.minIntervalMs ?? pacing.minIntervalMs);
    this.backoffBaseMs = opts.backoffBaseMs ?? 2000;
    this.maxAttempts = opts.maxAttempts ?? pacing.maxAttempts;
    this.stallTimeoutMs = opts.stallTimeoutMs ?? STALL_TIMEOUT_MS;
  }

  /** Rate-limited: one request at a time, and a longer gap between them. */
  private throttle(): void {
    this.pacer.slowDown();
    this.gate.resize(1);
  }

  /** A success: ease back towards the configured pace. */
  private ease(): void {
    if (this.pacer.recover()) this.gate.resize(this.baseConcurrency);
  }

  protected async call<T>(opts: CallOptions, parse: (text: string) => T): Promise<CallResult<T>> {
    const usage: UsageRecord[] = [];
    let maxTokens = opts.maxTokens;
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        opts.onStatus?.({ kind: "queued" });
        const r = await this.gate.run(async () => {
          await this.pacer.wait();
          opts.onStatus?.({ kind: "started" });
          return this.stream(opts, maxTokens);
        });
        this.ease();
        usage.push(this.toUsage(r, opts));
        if (r.finishReason === "length" || r.finishReason === "model_length") {
          if (maxTokens >= 64_000) throw new Error("Response hit max_tokens even after raising the limit");
          maxTokens = Math.min(maxTokens * 2, 64_000);
          lastError = new Error("max_tokens");
          continue;
        }
        if (r.finishReason === "error") throw new Error("Mistral stopped with an error mid-answer");
        if (!r.text.trim()) throw new Error(`Mistral returned no text (finish reason: ${r.finishReason ?? "none"})`);
        return { value: parse(r.text), usage };
      } catch (err) {
        lastError = err;
        // A model without reasoning support rejects the setting: call it again without one.
        if (
          err instanceof MistralError &&
          (err.statusCode === 400 || err.statusCode === 422) &&
          /reasoning/i.test(`${err.message} ${err.body}`) &&
          !this.noReasoning.has(opts.seat.model)
        ) {
          this.noReasoning.add(opts.seat.model);
          continue;
        }
        if (!isRetryable(err) && !(err instanceof Error && err.message.startsWith("Mistral stopped"))) throw err;
        if (attempt + 1 >= this.maxAttempts) break;
        if (isRateLimit(err)) this.throttle();
        const waitMs = retryAfterMs(err) ?? this.backoffBaseMs * 2 ** attempt * (0.5 + Math.random());
        const reason = describeError(err);
        logRetry("Mistral", opts, reason, waitMs, attempt + 1, this.maxAttempts);
        opts.onStatus?.({ kind: "retrying", reason, waitMs, attempt: attempt + 1, maxAttempts: this.maxAttempts });
        await sleep(waitMs);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Mistral call failed after retries");
  }

  private async stream(opts: CallOptions, maxTokens: number): Promise<StreamResult> {
    const model = opts.seat.model;
    // Our own stall timer replaces the SDK's 5-minute cap on the whole request, which a long reasoning answer can hit.
    const abort = new AbortController();
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        abort.abort();
      }, this.stallTimeoutMs);
    };
    arm();
    try {
      return await this.read(opts, model, maxTokens, abort.signal, arm);
    } catch (err) {
      throw stalled ? new StallError(this.stallTimeoutMs) : err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async read(opts: CallOptions, model: string, maxTokens: number, signal: AbortSignal, alive: () => void): Promise<StreamResult> {
    const events = await this.client.chat.stream({
      model,
      maxTokens,
      messages: [
        { role: "system", content: [...opts.cached, opts.system].join("\n\n") },
        { role: "user", content: opts.user },
      ],
      ...(this.noReasoning.has(model) ? {} : { reasoningEffort: reasoningFor(opts.seat.effort) }),
      ...(opts.jsonSchema
        ? {
            responseFormat: {
              type: "json_schema" as const,
              jsonSchema: { name: opts.stage === "vote" ? "votering" : "rangordning", schemaDefinition: opts.jsonSchema as Record<string, unknown>, strict: true },
            },
          }
        : {}),
    }, { fetchOptions: { signal } });
    const r: StreamResult = { text: "", finishReason: null, promptTokens: 0, completionTokens: 0 };
    let thinking = false;
    for await (const event of events) {
      alive();
      const chunk = event.data;
      const choice = chunk.choices[0];
      if (!thinking && hasThinking(choice?.delta.content)) {
        thinking = true;
        opts.onStatus?.({ kind: "thinking" });
      }
      const delta = deltaText(choice?.delta.content);
      if (delta) {
        r.text += delta;
        opts.onText?.(delta);
      }
      if (choice?.finishReason) r.finishReason = choice.finishReason;
      if (chunk.usage) {
        r.promptTokens = chunk.usage.promptTokens ?? r.promptTokens;
        r.completionTokens = chunk.usage.completionTokens ?? r.completionTokens;
      }
    }
    return r;
  }

  private toUsage(r: StreamResult, opts: CallOptions): UsageRecord {
    const counts = { inputTokens: r.promptTokens, outputTokens: r.completionTokens, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const model = opts.seat.model;
    return {
      stage: opts.stage,
      advisorId: opts.advisorId,
      round: opts.round,
      model,
      ...counts,
      costUsd: safeCost(model, counts),
      stopReason: r.finishReason,
      fellBack: false,
    };
  }
}

export interface MistralModelInfo {
  id: string;
  label: string;
}

/** Specialised families that are not general chat models. */
const NOT_FOR_DEBATE = /(codestral|devstral|pixtral|voxtral|ocr|embed|moderation|saba)/i;

/**
 * Chat models this key can use: the "-latest" aliases (always the current version), Large first. Also the key check:
 * it throws when the key is missing or rejected.
 */
export async function listMistralModels(client?: MistralClient): Promise<MistralModelInfo[]> {
  const c = client ?? new Mistral({ apiKey: getMistralApiKey() });
  let list: ModelList;
  try {
    list = await c.models.list();
  } catch (err) {
    if (err instanceof MistralError && (err.statusCode === 401 || err.statusCode === 403)) {
      throw new Error("Mistral avvisade nyckeln. Skapa en nyckel på console.mistral.ai och lägg den i MISTRAL_API_KEY.", { cause: err });
    }
    throw err;
  }
  const ids = new Set<string>();
  for (const m of list.data ?? []) {
    if (!("id" in m) || typeof m.id !== "string") continue;
    // Deprecated models (Magistral, for one) are on their way out and can be slow; leave them out of the picker.
    if ("deprecation" in m && m.deprecation) continue;
    const caps = "capabilities" in m ? (m.capabilities as { completionChat?: boolean } | undefined) : undefined;
    if (caps && caps.completionChat === false) continue;
    if (NOT_FOR_DEBATE.test(m.id) || !m.id.endsWith("-latest")) continue;
    ids.add(m.id);
  }
  const rank = (id: string) => (/large/.test(id) ? 0 : /medium/.test(id) ? 1 : /small/.test(id) ? 2 : /ministral/.test(id) ? 3 : 4);
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((id) => ({ id, label: modelLabel(id) }));
}
