import { PRICING, type ModelId } from "../config/models";
import type { UsageRecord } from "./types";

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** inputTokens is the uncached input only (as the API reports it); cache tokens are billed separately. */
export function computeCostUsd(model: string, t: TokenCounts): number {
  const p = PRICING[model as ModelId];
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
