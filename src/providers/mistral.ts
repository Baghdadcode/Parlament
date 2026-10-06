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

/** Mistral's answer when the key's plan does not include the model (e.g. a new preview on the free plan). */
export const isNotInPlan = (err: unknown) =>
  err instanceof MistralError && err.statusCode === 403 && /tier_not_allowed|subscription tier/i.test(`${err.message} ${err.body}`);

/** The message inside Mistral's JSON error body, instead of the raw "API error occurred: Status 403 Body: {…}". */
export function readableMistralError(err: unknown): Error {
  if (!(err instanceof MistralError)) return err instanceof Error ? err : new Error(String(err));
  let message = err.message;
  try {
    message = (JSON.parse(err.body) as { message?: string }).message ?? message;
  } catch {
    // not JSON: keep the SDK's message
  }
  return new Error(`Mistral (${err.statusCode}): ${message}`, { cause: err });
}

// What this server has learned about the key's plan, shared by every provider instance (the plan is per key).
const NOT_IN_PLAN = new Set<string>();
const SUBSTITUTE = new Map<string, string>();

/** Models the plan turned down, and what is used instead, for the picker. */
export function mistralPlan(): { blocked: string[]; substitutes: Record<string, string> } {
  return { blocked: [...NOT_IN_PLAN], substitutes: Object.fromEntries(SUBSTITUTE) };
}

/** Test hook: forget what was learned. */
export function resetMistralPlan(): void {
  NOT_IN_PLAN.clear();
  SUBSTITUTE.clear();
}

/** The model to call for a requested one, after any substitutions the plan forced. */
function resolveModel(model: string): string {
  let m = model;
  for (let i = 0; i < 10 && SUBSTITUTE.has(m); i++) m = SUBSTITUTE.get(m)!;
  return m;
}

const FAMILIES = ["large", "medium", "small"] as const;
const familyOf = (id: string) => FAMILIES.find((f) => id.includes(f)) ?? null;

/**
 * The nearest model the plan may include: the same family's other versions (newest first), then the smaller
 * families, each with its "-latest" alias before dated versions.
 */
export function substituteFrom(model: string, available: string[]): string | null {
  const start = Math.max(0, FAMILIES.indexOf(familyOf(model) ?? "large"));
  const usable = [...new Set([...available, ...MISTRAL_FALLBACKS])].filter((id) => id !== model && !NOT_IN_PLAN.has(id));
  for (const family of FAMILIES.slice(start)) {
    const inFamily = usable.filter((id) => id.startsWith(`mistral-${family}`));
    const latest = inFamily.filter((id) => id.endsWith("-latest"));
    const dated = inFamily.filter((id) => !id.endsWith("-latest")).sort((a, b) => b.localeCompare(a));
    // In the model's own family the "-latest" alias is the one that failed; try older versions first.
    const ordered = family === familyOf(model) ? [...dated, ...latest] : [...latest, ...dated];
    if (ordered[0]) return ordered[0];
  }
  return null;
}

const MISTRAL_FALLBACKS = ["mistral-medium-latest", "mistral-small-latest"];

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
  /** Every chat model ID the key can list (dated versions included), fetched once when a substitute is needed. */
  private chatModels?: Promise<string[]>;

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

  private async substituteFor(model: string): Promise<string | null> {
    this.chatModels ??= this.client.models
      .list()
      .then((l) => chatModelIds(l, { includeDated: true }))
      .catch(() => []);
    return substituteFrom(model, await this.chatModels);
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
        let model = resolveModel(opts.seat.model);
        const r = await this.gate.run(async () => {
          await this.pacer.wait();
          // Resolved again after waiting: another member may have learned a substitution meanwhile.
          model = resolveModel(opts.seat.model);
          opts.onStatus?.({ kind: "started" });
          return this.stream(opts, model, maxTokens);
        });
        this.ease();
        usage.push(this.toUsage(r, opts, model));
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
        // The plan does not include this model: remember that, and switch to the nearest model it does include.
        if (isNotInPlan(err)) {
          const blocked = resolveModel(opts.seat.model);
          NOT_IN_PLAN.add(blocked);
          const next = await this.substituteFor(blocked);
          if (!next) throw new Error(`Mistral: ${modelLabel(blocked)} ingår inte i din plan, och ingen annan Mistral-modell hittades.`, { cause: err });
          if (!SUBSTITUTE.has(blocked)) {
            SUBSTITUTE.set(blocked, next);
            console.warn(`[parlament] Mistral: ${blocked} is not in this key's plan; using ${next} instead`);
          }
          opts.onStatus?.({ kind: "fallback", from: blocked, to: resolveModel(blocked) });
          continue;
        }
        // A model without reasoning support rejects the setting: call it again without one.
        if (
          err instanceof MistralError &&
          (err.statusCode === 400 || err.statusCode === 422) &&
          /reasoning/i.test(`${err.message} ${err.body}`) &&
          !this.noReasoning.has(resolveModel(opts.seat.model))
        ) {
          this.noReasoning.add(resolveModel(opts.seat.model));
          continue;
        }
        if (!isRetryable(err) && !(err instanceof Error && err.message.startsWith("Mistral stopped"))) throw readableMistralError(err);
        if (attempt + 1 >= this.maxAttempts) break;
        if (isRateLimit(err)) this.throttle();
        const waitMs = retryAfterMs(err) ?? this.backoffBaseMs * 2 ** attempt * (0.5 + Math.random());
        const reason = describeError(err);
        logRetry("Mistral", opts, reason, waitMs, attempt + 1, this.maxAttempts);
        opts.onStatus?.({ kind: "retrying", reason, waitMs, attempt: attempt + 1, maxAttempts: this.maxAttempts });
        await sleep(waitMs);
      }
    }
    throw lastError ? readableMistralError(lastError) : new Error("Mistral call failed after retries");
  }

  private async stream(opts: CallOptions, model: string, maxTokens: number): Promise<StreamResult> {
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

  private toUsage(r: StreamResult, opts: CallOptions, model: string): UsageRecord {
    const counts = { inputTokens: r.promptTokens, outputTokens: r.completionTokens, cacheReadTokens: 0, cacheWriteTokens: 0 };
    return {
      stage: opts.stage,
      advisorId: opts.advisorId,
      round: opts.round,
      model,
      ...counts,
      costUsd: safeCost(model, counts),
      stopReason: r.finishReason,
      // Ran on a substitute because the plan does not include the requested model.
      fellBack: model !== opts.seat.model,
    };
  }
}

export interface MistralModelInfo {
  id: string;
  label: string;
}

/** Specialised families that are not general chat models. */
const NOT_FOR_DEBATE = /(codestral|devstral|pixtral|voxtral|ocr|embed|moderation|saba)/i;

/** Chat model IDs in a model list: no specialised families, no deprecated models; "-latest" aliases only unless asked. */
export function chatModelIds(list: ModelList, opts: { includeDated?: boolean } = {}): string[] {
  const ids = new Set<string>();
  for (const m of list.data ?? []) {
    if (!("id" in m) || typeof m.id !== "string") continue;
    // Deprecated models (Magistral, for one) are on their way out and can be slow; leave them out.
    if ("deprecation" in m && m.deprecation) continue;
    const caps = "capabilities" in m ? (m.capabilities as { completionChat?: boolean } | undefined) : undefined;
    if (caps && caps.completionChat === false) continue;
    if (NOT_FOR_DEBATE.test(m.id)) continue;
    if (!opts.includeDated && !m.id.endsWith("-latest")) continue;
    ids.add(m.id);
  }
  return [...ids];
}

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
  const rank = (id: string) => (/large/.test(id) ? 0 : /medium/.test(id) ? 1 : /small/.test(id) ? 2 : /ministral/.test(id) ? 3 : 4);
  return chatModelIds(list)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((id) => ({ id, label: modelLabel(id) }));
}
