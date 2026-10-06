import { describe, expect, it } from "vitest";
import { splitVerdict, toMemberView } from "../src/core/view";
import { estimateSessionCost } from "../src/core/estimate";
import { droppedIn, initialModel, reduce } from "../src/components/model";
import { extractProposal } from "../src/members/prompts";
import { loadMembers } from "../src/members/load";
import { ordinal } from "../src/components/format";

const { members, talman } = loadMembers("members");

describe("splitVerdict", () => {
  it("separates the reservations", () => {
    expect(splitVerdict("## Beslut\nGör X.\n\n## Reservationer\nB ville annat.")).toEqual({ main: "## Beslut\nGör X.", minority: "B ville annat." });
  });
  it("returns no reservations when there are none", () => {
    expect(splitVerdict("## Beslut\nGör X.")).toEqual({ main: "## Beslut\nGör X.", minority: null });
  });
});

describe("extractProposal", () => {
  it("takes the Förslag section of a rebuttal and the whole opening", () => {
    const rebuttal = "## Replik\nNej.\n\n## Förslag\nGör så här.\nOch så.\n\n## Rörelse\nStår fast.";
    expect(extractProposal(rebuttal, 1)).toBe("Gör så här.\nOch så.");
    expect(extractProposal("## Förslag\nA\n## Motivering\nB", 0)).toBe("## Förslag\nA\n## Motivering\nB");
    expect(extractProposal("inga rubriker", 2)).toBe("inga rubriker");
  });
});

describe("estimateSessionCost", () => {
  const base = { members, talman, mode: "full" as const, rounds: 2 };
  it("lands in a plausible range for 8 Opus members and 2 rounds", () => {
    const usd = estimateSessionCost({ ...base, questionChars: 200 });
    expect(usd).toBeGreaterThan(1);
    expect(usd).toBeLessThan(4);
  });
  it("is cheaper with fewer rounds, without a vote and with Sonnet", () => {
    const full = estimateSessionCost(base);
    expect(estimateSessionCost({ ...base, rounds: 1 })).toBeLessThan(full);
    expect(estimateSessionCost({ ...base, mode: "chairman" })).toBeLessThan(full);
    const sonnet = members.map((m) => ({ ...m, model: "claude-sonnet-5-5" as const }));
    expect(estimateSessionCost({ ...base, members: sonnet })).toBeLessThan(full);
  });
});

describe("live session reducer", () => {
  const seats = members.map(toMemberView);
  const init = () => initialModel(seats, toMemberView(talman), "full", 2);
  it("accumulates streamed statements per round and marks them done or failed", () => {
    let m = init();
    m = reduce(m, { type: "statement_delta", seatId: "s", round: 0, text: "## För" });
    m = reduce(m, { type: "statement_delta", seatId: "s", round: 0, text: "slag" });
    expect(m.statements[0]!.s).toEqual({ text: "## Förslag", status: "streaming" });
    m = reduce(m, { type: "statement_done", seatId: "s", round: 0 });
    m = reduce(m, { type: "round", round: 1 });
    m = reduce(m, { type: "statement_failed", seatId: "v", round: 1, error: "boom" });
    expect(m.statements[0]!.s!.status).toBe("done");
    expect(m.round).toBe(1);
    expect(droppedIn(m, "v")).toBe(1);
    expect(droppedIn(m, "s")).toBeNull();
  });
  it("tracks stage, votes, tally, cost and the decision", () => {
    let m = init();
    m = reduce(m, { type: "state", state: "ranking" });
    m = reduce(m, { type: "ranking_done", reviewerId: "s", reviewerLabel: "Ledamot 1", items: [{ answerSeatId: "m", rank: 1, reasoning: "r" }] });
    m = reduce(m, { type: "tally", tally: { entries: [], winnerSeatId: "m", marginFraction: 0.2, closeRace: false, tie: false } });
    m = reduce(m, { type: "cost", totalUsd: 0.42 });
    m = reduce(m, { type: "verdict_delta", text: "## Beslut" });
    expect(m).toMatchObject({ stage: "ranking", costUsd: 0.42, verdict: "## Beslut", effectiveMode: "full" });
    expect(m.rankings).toHaveLength(1);
  });
  it("marks a full-vote session as Speaker-decided when the decision starts without a tally", () => {
    expect(reduce(init(), { type: "verdict_delta", text: "x" }).effectiveMode).toBe("chairman");
  });
});

describe("ordinal", () => {
  it("uses Swedish ordinals", () => {
    expect([1, 2, 3, 7, 11, 12, 21].map(ordinal)).toEqual(["1:a", "2:a", "3:e", "7:e", "11:e", "12:e", "21:a"]);
  });
});
