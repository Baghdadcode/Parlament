// Single source of truth for model IDs and prices (USD per million tokens).
// Cache write (5 min TTL) = 1.25x input. Cache reads are $0.20 on both models (per the Claude API docs).
export const MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5"] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export interface ModelPricing {
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

export const PRICING: Record<ModelId, ModelPricing> = {
  "claude-opus-5-5": {
    label: "Opus 5.5",
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
  },
  "claude-sonnet-5-5": {
    label: "Sonnet 5.5",
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 2.5,
  },
};

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

export const LIMITS = {
  maxConcurrentRequests: 5,
  maxAttempts: 5,
  /** Members needed for a debate, and the most that can be labelled A–I in the blind vote. */
  minMembers: 3,
  maxMembers: 9,
  /** Share of the members that must still be standing after every round (8 members -> 5). */
  minSurvivingFraction: 0.6,
  closeRaceFraction: 0.1,
} as const;

/** Rebuttal rounds after the opening statements. */
export const DEBATE_ROUNDS = 2;

/** Members that must survive each round for the session to continue. */
export function minSurvivors(members: number): number {
  return Math.max(LIMITS.minMembers, Math.ceil(members * LIMITS.minSurvivingFraction));
}
