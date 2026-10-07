import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client";
import { memberWins, saveSession, upsertBrief } from "../src/db/store";
import { runSession } from "../src/core/orchestrator";
import { FakeProvider } from "../src/providers/fake";
import { loadMembers } from "../src/members/load";
import * as t from "../src/db/schema";
import { getSessionDetail, listBriefs, listSessions, maxSittingNumber, saveBrief } from "../src/db/queries";

const { members, talman } = loadMembers("members");
const order = ["c", "mp", "s", "m", "sd", "v", "kd", "l"];
const preferences = Object.fromEntries(members.map((m) => [m.id, order]));

async function stored(id = "fixed-id", opts: ConstructorParameters<typeof FakeProvider>[0] = {}) {
  const db = await openDb(":memory:");
  const brief = await upsertBrief(db, { id: "el", name: "Elpriser", content: "Fakta om elmarknaden..." });
  const result = await runSession({ question: "Q?", brief: brief.content, members, talman, mode: "full" }, new FakeProvider({ preferences, ...opts }));
  await saveSession(db, { id, question: "Q?", members, talman, riksmote: "2026/27", number: 14, brief, result, createdAt: new Date() });
  return { db, id };
}

describe("persistence", () => {
  it("stores a whole debate, the member file versions and counts wins", async () => {
    const { db } = await stored();
    expect(await db.select().from(t.statements).all()).toHaveLength(24);
    expect(await db.select().from(t.proposals).all()).toHaveLength(8);
    expect(await db.select().from(t.rankings).all()).toHaveLength(8 * 7);
    expect(await db.select().from(t.verdicts).all()).toHaveLength(1);
    expect(await db.select().from(t.usage).all()).toHaveLength(24 + 8 + 1 + 8);
    expect(await db.select().from(t.votes).all()).toHaveLength(8);
    expect(await db.select().from(t.members).all()).toHaveLength(9);
    const [session] = await db.select().from(t.sessions).all();
    expect(session!.briefUpdatedAt).toBeInstanceOf(Date);
    expect(session!.seats.map((s) => s.short)).toEqual(["S", "SD", "M", "V", "C", "KD", "MP", "L"]);
    expect(await memberWins(db)).toEqual({ c: 1 });
  });

  it("reads a stored debate back with rounds, labels, rankings and tally", async () => {
    const { db, id } = await stored();
    const d = (await getSessionDetail(db, id))!;
    expect(d.rounds).toBe(2);
    expect(d.brief).toMatchObject({ name: "Elpriser" });
    expect(d.seats).toHaveLength(8);
    expect(d.talman.name).toBe("Talmannen");
    expect(d.statements.filter((s) => s.round === 2).map((s) => s.seatId)).toEqual(["s", "sd", "m", "v", "c", "kd", "mp", "l"]);
    expect(d.labels.map((l) => l.label)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(d.rankings).toHaveLength(8);
    expect(d.rankings.map((r) => r.reviewerLabel)).toContain("Ledamot 8");
    expect(d.tally?.winnerSeatId).toBe("c");
    expect(d.winner?.short).toBe("C");
    expect(d.verdict).toContain("Reservationer");
    expect(d.usage.calls).toBe(41);
    expect(d.usage.models).toEqual(["mistral-large-latest"]);
    expect(d).toMatchObject({ riksmote: "2026/27", number: 14 });
    expect(d.finalVotes.map((v) => v.choice)).toEqual(["ja", "nej", "ja", "nej", "ja", "ja", "avstar", "ja"]);
    expect(d.finalTally).toEqual({ ja: 107 + 68 + 24 + 19 + 16, nej: 73 + 24, avstar: 18, franvarande: 0, passed: true });
    expect(d.seats.find((s) => s.id === "s")).toMatchObject({ title: "Partiordförande", seats: 107 });
    expect(await maxSittingNumber(db, "2026/27")).toBe(14);
    expect(await maxSittingNumber(db, "2027/28")).toBe(0);

    const list = await listSessions(db);
    expect(list[0]).toMatchObject({ id, rounds: 2, winner: expect.objectContaining({ id: "c" }) });
    expect(await getSessionDetail(db, "missing")).toBeNull();
  });

  it("keeps failed statements", async () => {
    const { db, id } = await stored("f", { failSpeakFor: { v: 1 } });
    const d = (await getSessionDetail(db, id))!;
    expect(d.statements.find((s) => s.seatId === "v" && s.round === 1)).toMatchObject({ status: "failed" });
    expect(d.statements.some((s) => s.seatId === "v" && s.round === 2)).toBe(false);
    expect(d.labels).toHaveLength(7);
  });

  it("only bumps a brief's edited date when its content changes, and saves edits", async () => {
    const db = await openDb(":memory:");
    const a = await upsertBrief(db, { id: "b", name: "B", content: "one" });
    const same = await upsertBrief(db, { id: "b", name: "B", content: "one" });
    expect(same.updatedAt.getTime()).toBe(a.updatedAt.getTime());
    const created = await saveBrief(db, { name: "Försvar & säkerhet", content: "x" });
    expect(created.id).toMatch(/^forsvar-sakerhet-/);
    const edited = await saveBrief(db, { id: created.id, name: created.name, content: "y" });
    expect(edited.content).toBe("y");
    expect(await listBriefs(db)).toHaveLength(2);
  });

  it("stores a 1-mot-1 debate with its format, order, judgment and winner", async () => {
    const db = await openDb(":memory:");
    const pair = ["sd", "v"].map((id) => members.find((m) => m.id === id)!);
    const result = await runSession({ question: "Q?", members: pair, talman, mode: "full", format: "duell" }, new FakeProvider({ duelWinner: "v" }));
    await saveSession(db, { id: "duel", question: "Q?", members: pair, talman, riksmote: "2026/27", number: 15, result, createdAt: new Date() });
    const d = (await getSessionDetail(db, "duel"))!;
    expect(d.format).toBe("duell");
    expect(d.mode).toBe("chairman");
    expect(d.seats.map((x) => x.id)).toEqual(["sd", "v"]);
    expect(d.statements.map((x) => `${x.round}:${x.seatId}`)).toEqual(["0:sd", "0:v", "1:sd", "1:v", "2:sd", "2:v"]);
    expect(d.winner?.id).toBe("v");
    expect(d.verdict).toMatch(/^Vinnare: Nooshi Dadgostar/);
    expect(d.finalTally).toBeNull();
    expect((await listSessions(db))[0]!.format).toBe("duell");
  });
});
