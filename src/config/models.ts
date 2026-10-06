// Single source of truth for model IDs, providers and prices (USD per million tokens).
// Claude: cache write (5 min TTL) = 1.25x input, cache reads $0.20 (per the Claude API docs).
// Gemini: prices from the Gemini Developer API pricing page (standard tier, prompts up to 200k tokens). Gemini caches
// implicitly, so there is no cache-write fee: uncached input is billed at the input price.

export type ProviderId = "anthropic" | "google";

/** Any model the app can call: a Claude model ("claude-…") or a Gemini model ("gemini-…"). */
export type ModelId = string;

export const PROVIDER_LABEL: Record<ProviderId, string> = { anthropic: "Claude (Anthropic)", google: "Gemini (Google)" };

/** Which provider serves a model, from its ID; null for an ID that is neither. */
export function providerOf(model: string): ProviderId | null {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  return null;
}

export const MODEL_ID_PATTERN = /^(claude|gemini)-[A-Za-z0-9.-]+$/;

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export interface ModelPricing {
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2.5 },
  "gemini-3.1-pro-preview": { label: "Gemini 3.1 Pro", inputPerMTok: 2, outputPerMTok: 12, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2 },
  // Introductory price through 31 Dec 2026 ($1.50 / $7.50 / $0.15 from 2027).
  "gemini-3.8-flash": { label: "Gemini 3.8 Flash", inputPerMTok: 0.75, outputPerMTok: 3.75, cacheReadPerMTok: 0.075, cacheWritePerMTok: 0.75 },
};

/** Models offered in the picker: the Claude models, plus Gemini defaults used until the API lists the real ones. */
export const CLAUDE_MODELS: ModelId[] = ["claude-opus-5-5", "claude-sonnet-5-5"];
export const GEMINI_FALLBACK_MODELS: ModelId[] = ["gemini-3.1-pro-preview", "gemini-3.8-flash"];

/**
 * Price for a model. Gemini models the table does not list (new or preview IDs found through the API) are priced
 * like their family (Pro or Flash), so the estimate stays useful; such prices are approximate.
 */
export function pricingFor(model: string): ModelPricing | null {
  const exact = PRICING[model];
  if (exact) return exact;
  if (providerOf(model) !== "google") return null;
  const base = /pro/.test(model) ? PRICING["gemini-3.1-pro-preview"]! : /flash/.test(model) ? PRICING["gemini-3.8-flash"]! : null;
  return base && { ...base, label: modelLabel(model) };
}

/** A readable name: "Claude Opus 5.5", "Gemini 3.1 Pro Preview". */
export function modelLabel(model: string): string {
  const known = PRICING[model];
  if (known) return known.label;
  return model
    .split("-")
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

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
