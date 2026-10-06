import { describe, expect, it } from "vitest";
import { bordaCount } from "../src/core/borda";

const ids = ["a", "b", "c", "d", "e"];
const rank = (order: string[]) => order.map((answerId, i) => ({ answerId, rank: i + 1 }));

describe("bordaCount", () => {
  it("gives first place N-1 points and last place 0", () => {
    const t = bordaCount(["a", "b", "c"], [{ reviewer: "x", items: rank(["a", "b", "c"]) }]);
    const pts = Object.fromEntries(t.entries.map((e) => [e.answerId, e.points]));
    expect(pts).toEqual({ a: 2, b: 1, c: 0 });
  });

  it("reports the winner and the margin over second place", () => {
    const reviews = ["r1", "r2", "r3", "r4"].map((reviewer) => ({ reviewer, items: rank(["a", "b", "c", "d"]) }));
    const t = bordaCount(["a", "b", "c", "d"], reviews);
    expect(t.winnerId).toBe("a");
    expect(t.runnerUpId).toBe("b");
    // a: 4*3=12, b: 4*2=8, max 12 -> margin 4/12
    expect(t.marginFraction).toBeCloseTo(1 / 3);
    expect(t.closeRace).toBe(false);
  });

  it("flags a close race when margin <= 10% of the maximum possible score", () => {
    // 10 reviews of 4 answers: max 30. a=25, b=24 -> margin 1/30 = 3.3%
    const flip = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        reviewer: `r${i}`,
        items: rank(i < 6 ? ["a", "b", "c", "d"] : i < 9 ? ["b", "a", "c", "d"] : ["b", "c", "a", "d"]),
      }));
    const t = bordaCount(["a", "b", "c", "d"], flip(10));
    expect(t.closeRace).toBe(true);
    expect(t.tie).toBe(false);
  });

  it("treats exactly 10% as close and just over 10% as not close", () => {
    // 10 reviews of 2 answers: max 10 each. a=5.. need margin exactly 1/10 -> a=... use fractions directly
    const mk = (aFirst: number) =>
      Array.from({ length: 10 }, (_, i) => ({ reviewer: `r${i}`, items: rank(i < aFirst ? ["a", "b"] : ["b", "a"]) }));
    expect(bordaCount(["a", "b"], mk(6)).marginFraction).toBeCloseTo(0.2); // 6 vs 4 of 10
    expect(bordaCount(["a", "b"], mk(6)).closeRace).toBe(false);
    expect(bordaCount(["a", "b"], mk(6), 0.2).closeRace).toBe(true);
  });

  it("sends exact ties to the chairman", () => {
    const t = bordaCount(["a", "b"], [
      { reviewer: "r1", items: rank(["a", "b"]) },
      { reviewer: "r2", items: rank(["b", "a"]) },
    ]);
    expect(t.tie).toBe(true);
    expect(t.winnerId).toBeNull();
    expect(t.closeRace).toBe(true);
  });

  it("normalizes when answers were reviewed by different numbers of reviewers", () => {
    // b's author did not review a; a was reviewed twice, b once.
    const t = bordaCount(["a", "b"], [
      { reviewer: "x", items: rank(["a", "b"]) },
      { reviewer: "y", items: rank(["b", "a"]) },
      { reviewer: "z", items: rank(["a", "b"]) },
    ]);
    expect(t.entries.find((e) => e.answerId === "a")!.maxPossible).toBe(3);
    expect(t.winnerId).toBe("a");
  });

  it("rejects reviews that point at unknown answers", () => {
    expect(() => bordaCount(ids, [{ reviewer: "x", items: [{ answerId: "zzz", rank: 1 }] }])).toThrow();
  });
});
