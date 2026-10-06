import { pricingFor, providerOf, type ModelPricing } from "../config/models";
import { mistralTier } from "../config/env";
import type { UsageRecord } from "./types";

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * What a model actually costs this user: its list price, or nothing for Mistral on the free (Experiment) tier.
 * Server side only (reads the environment).
 */
export function billedPricing(model: string): ModelPricing | null {
  const p = pricingFor(model);
  if (p && providerOf(model) === "mistral" && mistralTier() === "free") {
    return { ...p, inputPerMTok: 0, outputPerMTok: 0, cacheReadPerMTok: 0, cacheWritePerMTok: 0 };
  }
  return p;
}

/** inputTokens is the uncached input only (as the API reports it); cache tokens are billed separately. */
export function computeCostUsd(model: string, t: TokenCounts): number {
  const p = billedPricing(model);
  if (!p) throw new Error(`No pricing configured for model "${model}"`);
  return (
    (t.inputTokens * p.inputPerMTok +
      t.outputTokens * p.outputPerMTok +
      t.cacheReadTokens * p.cacheReadPerMTok +
      t.cacheWriteTokens * p.cacheWritePerMTok) /
    1_000_000
  );
}

export function sumCost(usage: UsageRecord[]): number {
  return usage.reduce((acc, u) => acc + u.costUsd, 0);
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}
