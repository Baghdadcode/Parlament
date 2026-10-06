import { describe, expect, it } from "vitest";
import { InvalidRankingError, parseRanking } from "../src/core/schemas";

const item = (label: string, rank: number) => ({
  label, rank, correctness: 4, reasoning_quality: 3, usefulness: 5, risks_covered: 2, reasoning: "ok.",
});
const json = (items: unknown[]) => JSON.stringify({ ranking: items });

describe("parseRanking", () => {
  it("accepts a full valid ranking and sorts it by rank", () => {
    const out = parseRanking(json([item("B", 2), item("A", 1)]), ["A", "B"]);
    expect(out.map((i) => i.label)).toEqual(["A", "B"]);
    expect(out[0]!.reasoningQuality).toBe(3);
  });
  it.each([
    ["invalid JSON", "nope"],
    ["missing field", JSON.stringify({ ranking: [{ label: "A", rank: 1 }] })],
    ["duplicate labels", json([item("A", 1), item("A", 2)])],
    ["missing label", json([item("A", 1)])],
    ["unknown label", json([item("A", 1), item("Z", 2)])],
    ["tied ranks", json([item("A", 1), item("B", 1)])],
    ["rank gap", json([item("A", 1), item("B", 3)])],
    ["score out of range", json([{ ...item("A", 1), correctness: 9 }, item("B", 2)])],
  ])("rejects %s", (_name, raw) => {
    expect(() => parseRanking(raw, ["A", "B"])).toThrow(InvalidRankingError);
  });
});
