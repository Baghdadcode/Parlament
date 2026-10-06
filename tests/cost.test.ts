import { describe, expect, it } from "vitest";
import { computeCostUsd, sumCost } from "../src/core/cost";

describe("computeCostUsd", () => {
  it("prices Opus 5.5 at $4 in / $20 out per million", () => {
    expect(computeCostUsd("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(24);
  });
  it("prices Sonnet 5.5 at $2 in / $10 out per million", () => {
    expect(computeCostUsd("claude-sonnet-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(12);
  });
  it("bills cache reads and writes separately from input", () => {
    const c = computeCostUsd("claude-opus-5-5", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 });
    expect(c).toBeCloseTo(0.2 + 5);
  });
  it("throws for models with no configured price", () => {
    expect(() => computeCostUsd("gpt-x", { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })).toThrow();
  });
  it("sums usage records", () => {
    expect(sumCost([{ costUsd: 1 }, { costUsd: 2.5 }] as never)).toBe(3.5);
  });
});
