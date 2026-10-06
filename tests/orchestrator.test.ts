import { describe, expect, it } from "vitest";
import { runSession, type SessionEvent } from "../src/core/orchestrator";
import { FakeProvider } from "../src/providers/fake";
import { loadMembers } from "../src/members/load";

const { members, talman } = loadMembers("members");
const ids = members.map((m) => m.id);
const base = { question: "Hur ska elpriserna sänkas?", members, talman, mode: "full" as const };

describe("runSession (fake provider)", () => {
  it("runs opening -> 2 rebuttal rounds -> vote -> count -> Speaker -> done", async () => {
    const states: string[] = [];
    const rounds: number[] = [];
    const p = new FakeProvider();
    const onEvent = (e: SessionEvent) => {
      if (e.type === "state") states.push(e.state);
      if (e.type === "round") rounds.push(e.round);
    };
    const r = await runSession({ ...base, onEvent }, p);
    expect(states).toEqual(["opening", "debating", "ranking", "counting", "synthesizing", "done"]);
    expect(rounds).toEqual([0, 1, 2]);
    expect(r.state).toBe("done");
    expect(p.calls).toEqual({ speak: 8 * 3, rank: 8, synthesize: 1 });
    expect(r.statements).toHaveLength(24);
    expect(r.tally).toBeDefined();
    expect(r.verdict).toContain("## Beslut");
    expect(r.totalCostUsd).toBeGreaterThan(0);
  });

  it("gives nobody a transcript in the opening, and everyone the full named transcript later", async () => {
    const p = new FakeProvider();
    await runSession(base, p);
    for (const req of p.seen.speak.filter((s) => s.round === 0)) expect(req.transcript).toEqual([]);
    for (const req of p.seen.speak.filter((s) => s.round === 2)) {
      expect(req.transcript).toHaveLength(16);
      expect(new Set(req.transcript.map((t) => t.round))).toEqual(new Set([0, 1]));
      expect(req.transcript.map((t) => t.speaker)).toContain("Magdalena Andersson (S)");
      expect(req.totalRounds).toBe(2);
    }
  });

  it("votes on each member's final Förslag section, blind, never on their own", async () => {
    const p = new FakeProvider();
    await runSession(base, p);
    for (const req of p.seen.rank) {
      expect(req.answers).toHaveLength(7);
      expect(req.answers.some((a) => a.text.includes(`[id:${req.reviewer.id}]`))).toBe(false);
      for (const a of req.answers) {
        expect(a.text).toMatch(/^Mitt förslag efter replikrunda 2/);
        expect(a.text).not.toMatch(/Replik|Rörelse/);
      }
    }
  });

  it("picks the member most voters prefer", async () => {
    const order = ["c", "mp", "s", "m", "sd", "v", "kd", "l"];
    const preferences = Object.fromEntries(ids.map((id) => [id, order]));
    const r = await runSession(base, new FakeProvider({ preferences }));
    expect(r.winnerSeatId).toBe("c");
    expect(r.tally!.closeRace).toBe(false);
  });

  it("hands the Speaker neutral labels, redacted proposals and the tally", async () => {
    const p = new FakeProvider();
    await runSession({ ...base, rounds: 0 }, p);
    const req = p.seen.synthesize[0]!;
    expect(req.talman.id).toBe("talman");
    expect(req.answers.map((a) => a.label)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    for (const a of req.answers) {
      for (const m of members) {
        expect(a.text).not.toContain(m.name);
        expect(a.text).not.toContain(m.party);
      }
    }
    expect(req.reviews).toHaveLength(8);
    expect(req.reviews[0]!.reviewer).toBe("Ledamot 1");
    expect(req.tally?.scores).toHaveLength(8);
  });

  it("drops a member that fails a round from later rounds and the vote", async () => {
    const p = new FakeProvider({ failSpeakFor: { kd: 1 } });
    const r = await runSession(base, p);
    expect(r.state).toBe("done");
    expect(r.failedSeats).toEqual([expect.objectContaining({ seatId: "kd", stage: "speak", round: 1 })]);
    expect(p.seen.speak.filter((s) => s.member.id === "kd").map((s) => s.round)).toEqual([0, 1]);
    expect(r.answers.map((a) => a.seatId)).not.toContain("kd");
    expect(p.calls.rank).toBe(7);
  });

  it("fails when fewer than 5 of 8 members are left", async () => {
    const r = await runSession(base, new FakeProvider({ failSpeakFor: { s: 0, m: 0, sd: 1, v: 2 } }));
    expect(r.state).toBe("failed");
    expect(r.error).toMatch(/minst 5/);
  });

  it("survives a failed voter", async () => {
    const r = await runSession(base, new FakeProvider({ failRankFor: ["l"] }));
    expect(r.state).toBe("done");
    expect(r.rankings).toHaveLength(7);
  });

  it("lets the Speaker decide when no vote survives", async () => {
    const r = await runSession(base, new FakeProvider({ failRankFor: ids }));
    expect(r.state).toBe("done");
    expect(r.effectiveMode).toBe("chairman");
  });

  it("Speaker-decides mode skips the vote", async () => {
    const states: string[] = [];
    const p = new FakeProvider();
    const r = await runSession({ ...base, mode: "chairman", rounds: 1, onEvent: (e) => e.type === "state" && states.push(e.state) }, p);
    expect(states).toEqual(["opening", "debating", "synthesizing", "done"]);
    expect(p.calls).toEqual({ speak: 16, rank: 0, synthesize: 1 });
    expect(r.tally).toBeUndefined();
  });

  it("with zero rebuttal rounds the opening statement is the proposal", async () => {
    const p = new FakeProvider();
    const r = await runSession({ ...base, rounds: 0 }, p);
    expect(p.calls.speak).toBe(8);
    expect(r.answers[0]!.text).toContain("## Motivering");
  });
});
