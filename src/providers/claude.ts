import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { LIMITS } from "../config/models";
import { getApiKey } from "../config/env";
import { computeCostUsd } from "../core/cost";
import { RANKING_JSON_SCHEMA, VOTE_JSON_SCHEMA, parseRanking, parseVote } from "../core/schemas";
import type {
  CallResult,
  MemberDef,
  ParlamentProvider,
  RankRequest,
  RankingOutput,
  SpeakRequest,
  Stage,
  SynthesizeRequest,
  UsageRecord,
  VoteOutput,
  VoteRequest,
} from "../core/types";
import {
  briefBlock,
  memberSystem,
  rankSystem,
  rankUser,
  speakUser,
  talmanSystem,
  talmanUser,
  transcriptBlock,
  voteSystem,
  voteUser,
} from "../members/prompts";

export class RefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`The model declined this request (category: ${category ?? "unknown"})`);
    this.name = "RefusalError";
  }
}

export class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.APIError) return typeof err.status === "number" && err.status >= 500;
  return false;
}

function retryAfterMs(err: unknown): number | null {
  if (!(err instanceof Anthropic.APIError)) return null;
  const raw = err.headers?.get?.("retry-after");
  const secs = raw ? Number(raw) : NaN;
  return Number.isFinite(secs) ? secs * 1000 : null;
}

export interface CallOptions {
  stage: Stage;
  advisorId: string | null;
  round: number | null;
  seat: Pick<MemberDef, "model" | "effort">;
  system: string;
  /** Shared blocks sent first, each with a cache breakpoint: the brief, then the debate so far. */
  cached: string[];
  user: string;
  maxTokens: number;
  jsonSchema?: object;
  onText?: (delta: string) => void;
}

export interface ClaudeProviderOptions {
  client?: Anthropic;
  /** Base delay for exponential backoff; tests set it to 0. */
  backoffBaseMs?: number;
}

export class ClaudeProvider implements ParlamentProvider {
  private readonly client: Anthropic;
  private readonly gate = new Semaphore(LIMITS.maxConcurrentRequests);
  private readonly backoffBaseMs: number;

  constructor(opts: ClaudeProviderOptions = {}) {
    // maxRetries is 0 because retries (with Retry-After and jitter) are handled below.
    this.client = opts.client ?? new Anthropic({ apiKey: getApiKey(), maxRetries: 0 });
    this.backoffBaseMs = opts.backoffBaseMs ?? 1000;
  }

  speak(req: SpeakRequest): Promise<CallResult<string>> {
    const cached = briefCache(req.brief);
    if (req.transcript.length > 0) cached.push(transcriptBlock(req.transcript));
    return this.call(
      {
        stage: req.round === 0 ? "opening" : "debate",
        advisorId: req.member.id,
        round: req.round,
        seat: req.member,
        system: memberSystem(req.member, req.round, req.totalRounds, req.address),
        cached,
        user: speakUser(req.question),
        maxTokens: 16_000,
        onText: req.onText,
      },
      (text) => text,
    );
  }

  rank(req: RankRequest): Promise<CallResult<RankingOutput>> {
    const expected = req.answers.map((a) => a.label);
    return this.call(
      {
        stage: "rank",
        advisorId: req.reviewer.id,
        round: null,
        seat: req.reviewer,
        system: rankSystem(req.reviewer),
        cached: briefCache(req.brief),
        user: rankUser(req.question, req.answers),
        maxTokens: 16_000,
        jsonSchema: RANKING_JSON_SCHEMA,
      },
      (text) => ({ items: parseRanking(text, expected) }),
    );
  }

  synthesize(req: SynthesizeRequest): Promise<CallResult<string>> {
    return this.call(
      {
        stage: "synthesize",
        advisorId: req.talman.id,
        round: null,
        seat: req.talman,
        system: talmanSystem(req.talman, req.mode),
        cached: briefCache(req.brief),
        user: talmanUser(req),
        maxTokens: 32_000,
        onText: req.onText,
      },
      (text) => text,
    );
  }

  vote(req: VoteRequest): Promise<CallResult<VoteOutput>> {
    return this.call(
      {
        stage: "vote",
        advisorId: req.member.id,
        round: null,
        seat: req.member,
        system: voteSystem(req.member),
        cached: briefCache(req.brief),
        user: voteUser(req),
        maxTokens: 16_000,
        jsonSchema: VOTE_JSON_SCHEMA,
      },
      parseVote,
    );
  }

  private async call<T>(opts: CallOptions, parse: (text: string) => T): Promise<CallResult<T>> {
    const usage: UsageRecord[] = [];
    let maxTokens = opts.maxTokens;
    let lastError: unknown;

    for (let attempt = 0; attempt < LIMITS.maxAttempts; attempt++) {
      try {
        const message = await this.gate.run(() => this.stream(opts, maxTokens));
        usage.push(...this.toUsage(message, opts));

        // Always check stop_reason before reading content.
        if (message.stop_reason === "refusal") {
          throw new RefusalError(message.stop_details?.category ?? null);
        }
        if (message.stop_reason === "max_tokens") {
          if (maxTokens >= 64_000) throw new Error("Response hit max_tokens even after raising the limit");
          maxTokens *= 2; // thinking shares the budget; give it room and try again
          lastError = new Error("max_tokens");
          continue;
        }
        const text = message.content
          .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
          .map((b) => b.text)
          .join("");
        return { value: parse(text), usage };
      } catch (err) {
        if (err instanceof RefusalError) throw err;
        lastError = err;
        if (!isRetryable(err)) throw err;
        const wait = retryAfterMs(err) ?? this.backoffBaseMs * 2 ** attempt * (0.5 + Math.random());
        await sleep(wait);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Claude call failed after retries");
  }

  private async stream(opts: CallOptions, maxTokens: number): Promise<BetaMessage> {
    // Shared blocks go first (brief, then the debate so far) so the parallel calls in a round reuse a cached prefix.
    const system: Anthropic.Beta.BetaTextBlockParam[] = opts.cached.map((text) => ({
      type: "text",
      text,
      cache_control: { type: "ephemeral" },
    }));
    system.push({ type: "text", text: opts.system });

    // No temperature (rejected by these models) and no forced tool_choice; seats differ by prompt alone.
    const stream = this.client.beta.messages.stream({
      model: opts.seat.model,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      output_config: {
        effort: opts.seat.effort,
        ...(opts.jsonSchema ? { format: { type: "json_schema", schema: opts.jsonSchema as Record<string, unknown> } } : {}),
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: opts.user }],
    });
    if (opts.onText) stream.on("text", opts.onText);
    return stream.finalMessage();
  }

  private toUsage(message: BetaMessage, opts: CallOptions): UsageRecord[] {
    const base = { stage: opts.stage, advisorId: opts.advisorId, round: opts.round, stopReason: message.stop_reason };
    const iterations = message.usage.iterations ?? [];
    const fallbackRan = iterations.some((i) => i.type === "fallback_message");
    // With a fallback, usage.iterations is the per-attempt source of truth.
    const messageIterations = iterations.filter(
      (i): i is Extract<typeof i, { type: "message" | "fallback_message" }> =>
        i.type === "message" || i.type === "fallback_message",
    );
    if (fallbackRan && messageIterations.length > 0) {
      return messageIterations.map((i) => {
        const counts = {
          inputTokens: i.input_tokens,
          outputTokens: i.output_tokens,
          cacheReadTokens: i.cache_read_input_tokens ?? 0,
          cacheWriteTokens: i.cache_creation_input_tokens ?? 0,
        };
        const model = "model" in i && typeof i.model === "string" ? i.model : message.model;
        return { ...base, ...counts, model, costUsd: safeCost(model, counts), fellBack: i.type === "fallback_message" };
      });
    }
    const counts = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    return [{ ...base, ...counts, model: message.model, costUsd: safeCost(message.model, counts), fellBack: false }];
  }
}

const briefCache = (brief?: string): string[] => (brief ? [briefBlock(brief)] : []);

function safeCost(model: string, counts: Parameters<typeof computeCostUsd>[1]): number {
  try {
    return computeCostUsd(model, counts);
  } catch {
    return 0; // a fallback model with no configured price is reported with zero rather than crashing the run
  }
}

/** Cheap startup check. Models API call; throws a readable error when the key is missing or invalid. */
export async function checkApiKey(client?: Anthropic): Promise<void> {
  const c = client ?? new Anthropic({ apiKey: getApiKey(), maxRetries: 1 });
  try {
    await c.models.list({ limit: 1 });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new Error(
        "Anthropic avvisade API-nyckeln. Parlament behöver en API-nyckel från console.anthropic.com; ett Claude.ai-abonnemang fungerar inte.",
        { cause: err },
      );
    }
    throw err;
  }
}
