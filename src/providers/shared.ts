// What every model provider shares: the request each step of a sitting sends (identical prompts whichever model
// answers), refusal and concurrency helpers, and cost accounting.
import { computeCostUsd } from "../core/cost";
import { RANKING_JSON_SCHEMA, VOTE_JSON_SCHEMA, parseRanking, parseVote } from "../core/schemas";
import type {
  CallResult,
  CallStatus,
  JudgeRequest,
  MemberDef,
  ParlamentProvider,
  RankRequest,
  RankingOutput,
  SpeakRequest,
  Stage,
  SynthesizeRequest,
  VoteOutput,
  VoteRequest,
} from "../core/types";
import {
  briefBlock,
  judgeSystem,
  judgeUser,
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
  constructor(private max: number) {}
  get limit(): number {
    return this.max;
  }
  /** Changes how many may run at once; waiters re-check the new limit. */
  resize(max: number): void {
    this.max = Math.max(1, max);
    for (const wake of this.waiters.splice(0)) wake();
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.active >= this.max) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spaces out request starts, for providers that limit requests per second (Mistral's free tier). */
export class Pacer {
  private nextAt = 0;
  private intervalMs: number;
  constructor(private readonly baseMs: number) {
    this.intervalMs = baseMs;
  }
  get interval(): number {
    return this.intervalMs;
  }
  /** After a rate-limit error: at least double the gap (2 s minimum, 60 s maximum). */
  slowDown(): void {
    this.intervalMs = Math.min(60_000, Math.max(2_000, this.intervalMs * 2));
  }
  /** After a success: move back towards the configured gap. Returns true once it is back there. */
  recover(): boolean {
    this.intervalMs = Math.max(this.baseMs, Math.round(this.intervalMs * 0.8));
    if (this.intervalMs - this.baseMs < 50) this.intervalMs = this.baseMs;
    return this.intervalMs === this.baseMs;
  }
  async wait(): Promise<void> {
    if (this.intervalMs <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.nextAt);
    this.nextAt = at + this.intervalMs;
    if (at > now) await sleep(at - now);
  }
}

/** One model call, independent of the provider that makes it. */
export interface CallOptions {
  stage: Stage;
  advisorId: string | null;
  round: number | null;
  seat: Pick<MemberDef, "model" | "effort">;
  /** The task-specific system prompt (persona and instructions). */
  system: string;
  /** Shared blocks sent before `system`, in order: the brief, then the debate so far. Providers cache them. */
  cached: string[];
  user: string;
  maxTokens: number;
  jsonSchema?: object;
  onText?: (delta: string) => void;
  onStatus?: (s: CallStatus) => void;
}

/** Logged in the server terminal, so a slow sitting can be followed there too. */
export function logRetry(provider: string, opts: CallOptions, reason: string, waitMs: number, attempt: number, max: number): void {
  console.warn(
    `[parlament] ${provider} ${opts.seat.model} (${opts.stage}${opts.advisorId ? ` ${opts.advisorId}` : ""}): ${reason}; retry ${attempt}/${max - 1} in ${Math.round(waitMs / 1000)} s`,
  );
}

/** A short, readable reason for a failed attempt. */
export function describeError(err: unknown): string {
  const e = err as { status?: unknown; statusCode?: unknown } | null;
  const status = e?.status ?? e?.statusCode;
  if (status === 429) return "för många förfrågningar (rate limit)";
  if (typeof status === "number" && status >= 500) return `serverfel ${status}`;
  if (err instanceof Error) return err.message.slice(0, 120);
  return String(err).slice(0, 120);
}

const briefCache = (brief?: string): string[] => (brief ? [briefBlock(brief)] : []);

/** The steps of a sitting as provider-neutral calls. */
export const requests = {
  speak(req: SpeakRequest): CallOptions {
    const cached = briefCache(req.brief);
    if (req.transcript.length > 0) cached.push(transcriptBlock(req.transcript));
    return {
      stage: req.round === 0 ? "opening" : "debate",
      advisorId: req.member.id,
      round: req.round,
      seat: req.member,
      system: memberSystem(req.member, req.round, req.totalRounds, req.address, req.opponent),
      cached,
      user: speakUser(req.question),
      maxTokens: 16_000,
      onText: req.onText,
      onStatus: req.onStatus,
    };
  },
  rank(req: RankRequest): CallOptions {
    return {
      stage: "rank",
      advisorId: req.reviewer.id,
      round: null,
      seat: req.reviewer,
      system: rankSystem(req.reviewer),
      cached: briefCache(req.brief),
      user: rankUser(req.question, req.answers),
      maxTokens: 16_000,
      jsonSchema: RANKING_JSON_SCHEMA,
      onStatus: req.onStatus,
    };
  },
  synthesize(req: SynthesizeRequest): CallOptions {
    return {
      stage: "synthesize",
      advisorId: req.talman.id,
      round: null,
      seat: req.talman,
      system: talmanSystem(req.talman, req.mode),
      cached: briefCache(req.brief),
      user: talmanUser(req),
      maxTokens: 32_000,
      onText: req.onText,
      onStatus: req.onStatus,
    };
  },
  judge(req: JudgeRequest): CallOptions {
    const cached = briefCache(req.brief);
    cached.push(transcriptBlock(req.transcript));
    return {
      stage: "judge",
      advisorId: req.talman.id,
      round: null,
      seat: req.talman,
      system: judgeSystem(req.talman, req.debaters),
      cached,
      user: judgeUser(req),
      maxTokens: 16_000,
      onText: req.onText,
      onStatus: req.onStatus,
    };
  },
  vote(req: VoteRequest): CallOptions {
    return {
      stage: "vote",
      advisorId: req.member.id,
      round: null,
      seat: req.member,
      system: voteSystem(req.member),
      cached: briefCache(req.brief),
      user: voteUser(req),
      maxTokens: 16_000,
      jsonSchema: VOTE_JSON_SCHEMA,
      onStatus: req.onStatus,
    };
  },
};

/** JSON output can arrive wrapped in a markdown code fence; strip it before parsing. */
export const unfence = (text: string) => text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");

/** A provider only has to make one call; the steps are built here, the same way for every model. */
export abstract class CallProvider implements ParlamentProvider {
  protected abstract call<T>(opts: CallOptions, parse: (text: string) => T): Promise<CallResult<T>>;

  speak(req: SpeakRequest): Promise<CallResult<string>> {
    return this.call(requests.speak(req), (text) => text);
  }

  rank(req: RankRequest): Promise<CallResult<RankingOutput>> {
    const expected = req.answers.map((a) => a.label);
    return this.call(requests.rank(req), (text) => ({ items: parseRanking(unfence(text), expected) }));
  }

  synthesize(req: SynthesizeRequest): Promise<CallResult<string>> {
    return this.call(requests.synthesize(req), (text) => text);
  }

  judge(req: JudgeRequest): Promise<CallResult<string>> {
    return this.call(requests.judge(req), (text) => text);
  }

  vote(req: VoteRequest): Promise<CallResult<VoteOutput>> {
    return this.call(requests.vote(req), (text) => parseVote(unfence(text)));
  }
}

export function safeCost(model: string, counts: Parameters<typeof computeCostUsd>[1]): number {
  try {
    return computeCostUsd(model, counts);
  } catch {
    return 0; // a model with no configured price is reported with zero rather than crashing the run
  }
}
