import { describe, expect, it } from "vitest";
import { toMemberView } from "../src/core/view";
import { estimateSessionCost } from "../src/core/estimate";
import { anforanden, droppedIn, initialModel, reduce } from "../src/components/model";
import { extractProposal } from "../src/members/prompts";
import { loadMembers } from "../src/members/load";
import { ordinal } from "../src/components/format";

const { members, talman } = loadMembers("members");

describe("extractProposal", () => {
  it("takes the Förslag section of a rebuttal and the whole opening", () => {
    const rebuttal = "## Replik\nNej.\n\n## Förslag\nGör så här.\nOch så.\n\n## Rörelse\nStår fast.";
    expect(extractProposal(rebuttal, 1)).toBe("Gör så här.\nOch så.");
    expect(extractProposal("## Förslag\nA\n## Motivering\nB", 0)).toBe("## Förslag\nA\n## Motivering\nB");
    expect(extractProposal("inga rubriker", 2)).toBe("inga rubriker");
  });
});

describe("estimateSessionCost", () => {
  const opus = (m: (typeof members)[number]) => ({ ...m, model: "claude-opus-5-5" });
  const base = { members: members.map(opus), talman: opus(talman), mode: "full" as const, rounds: 2 };
  it("lands in a plausible range for 8 Opus members and 2 rounds", () => {
    const usd = estimateSessionCost({ ...base, questionChars: 200 });
    expect(usd).toBeGreaterThan(1);
    expect(usd).toBeLessThan(4);
  });
  it("is free for Mistral on the free tier", () => {
    expect(estimateSessionCost({ members, talman, mode: "full", rounds: 2 })).toBe(0);
  });
  it("is cheaper with fewer rounds, without a vote and with Sonnet", () => {
    const full = estimateSessionCost(base);
    expect(estimateSessionCost({ ...base, rounds: 1 })).toBeLessThan(full);
    expect(estimateSessionCost({ ...base, mode: "chairman" })).toBeLessThan(full);
    const sonnet = members.map((m) => ({ ...m, model: "claude-sonnet-5-5" }));
    expect(estimateSessionCost({ ...base, members: sonnet })).toBeLessThan(full);
  });
});

describe("live session reducer", () => {
  const seats = members.map(toMemberView);
  const init = () => initialModel({ seats, talman: toMemberView(talman), mode: "full", rounds: 2, riksmote: "2026/27", number: 3, createdAt: null });
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
  it("collects main votes as they come and the final tally", () => {
    let m = reduce(init(), { type: "vote_done", seatId: "s", choice: "ja", explanation: "Bra.", weight: 107 });
    expect(m.votes.s).toEqual({ choice: "ja", explanation: "Bra.", weight: 107 });
    m = reduce(m, {
      type: "vote_result",
      votes: [
        { seatId: "s", choice: "ja", explanation: "Bra.", weight: 107 },
        { seatId: "v", choice: "franvarande", explanation: "", weight: 24 },
      ],
      tally: { ja: 107, nej: 0, avstar: 0, franvarande: 24, passed: true },
    });
    expect(m.votes.v!.choice).toBe("franvarande");
    expect(m.finalTally?.passed).toBe(true);
  });
  it("numbers speeches across rounds like the record, leaving out members who dropped out", () => {
    let m = init();
    for (const s of seats) m = reduce(m, { type: "statement_done", seatId: s.id, round: 0 });
    m = reduce(m, { type: "statement_failed", seatId: "v", round: 1, error: "x" });
    const list = anforanden(m);
    expect(list.filter((a) => a.round === 0).map((a) => a.anf)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const r1 = list.filter((a) => a.round === 1);
    expect(r1.find((a) => a.seat.id === "v")!.anf).toBeNull();
    expect(r1.map((a) => a.anf).filter(Boolean)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(list.filter((a) => a.round === 2).map((a) => a.seat.id)).not.toContain("v");
  });
});

describe("ordinal", () => {
  it("uses Swedish ordinals", () => {
    expect([1, 2, 3, 7, 11, 12, 21].map(ordinal)).toEqual(["1:a", "2:a", "3:e", "7:e", "11:e", "12:e", "21:a"]);
  });
});
