import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ParlamentDb } from "./client";
import * as t from "./schema";
import type { SessionResult } from "../core/orchestrator";
import { toMemberView } from "../core/view";
import type { MemberDef, SessionBrief } from "../core/types";

/** Stores this version of a member file if it is not stored yet. */
export async function saveMember(db: ParlamentDb, m: MemberDef): Promise<void> {
  await db
    .insert(t.members)
    .values({
      id: m.id,
      hash: m.hash,
      name: m.name,
      party: m.party,
      short: m.short,
      color: m.color,
      role: m.role,
      persona: m.persona,
      model: m.model,
      effort: m.effort,
      file: m.file,
    })
    .onConflictDoNothing()
    .run();
}

export async function upsertBrief(
  db: ParlamentDb,
  brief: { id: string; name: string; content: string },
): Promise<SessionBrief> {
  const updatedAt = new Date();
  const existing = await db.select().from(t.briefs).where(eq(t.briefs.id, brief.id)).get();
  if (existing && existing.content === brief.content) {
    return { id: existing.id, name: existing.name, content: existing.content, updatedAt: existing.updatedAt };
  }
  await db
    .insert(t.briefs)
    .values({ ...brief, updatedAt })
    .onConflictDoUpdate({ target: t.briefs.id, set: { name: brief.name, content: brief.content, updatedAt } })
    .run();
  return { ...brief, updatedAt };
}

export async function saveSession(
  db: ParlamentDb,
  args: {
    id?: string;
    question: string;
    members: MemberDef[];
    talman: MemberDef;
    riksmote: string;
    number: number;
    brief?: SessionBrief;
    result: SessionResult;
    createdAt: Date;
  },
): Promise<string> {
  const { question, members, talman, brief, result } = args;
  const sessionId = args.id ?? randomUUID();
  const proposalRowId = new Map<string, string>(result.answers.map((a) => [a.answerId, `${sessionId}:${a.answerId}`]));

  for (const m of [...members, talman]) await saveMember(db, m);

  await db.transaction(async (tx) => {
    await tx
      .insert(t.sessions)
      .values({
        id: sessionId,
        question,
        seats: members.map((m) => ({ ...toMemberView(m), hash: m.hash })),
        talman: { ...toMemberView(talman), hash: talman.hash },
        rounds: result.rounds,
        riksmote: args.riksmote,
        number: args.number,
        finalTally: result.finalTally ?? null,
        briefId: brief?.id ?? null,
        briefContent: brief?.content ?? null,
        briefUpdatedAt: brief?.updatedAt ?? null,
        format: result.format,
        mode: result.mode,
        effectiveMode: result.effectiveMode,
        state: result.state,
        error: result.error ?? null,
        winnerMemberId: result.winnerSeatId ?? null,
        marginFraction: result.tally?.marginFraction ?? null,
        closeRace: result.tally?.closeRace ?? null,
        totalCostUsd: result.totalCostUsd,
        createdAt: args.createdAt,
        finishedAt: new Date(),
      })
      .run();

    for (const s of result.statements) {
      await tx
        .insert(t.statements)
        .values({ id: `${sessionId}:${s.round}:${s.seatId}`, sessionId, memberId: s.seatId, round: s.round, text: s.text, status: "ok" })
        .run();
    }
    for (const f of result.failedSeats) {
      if (f.stage !== "speak") continue;
      await tx
        .insert(t.statements)
        .values({ id: `${sessionId}:${f.round}:${f.seatId}`, sessionId, memberId: f.seatId, round: f.round ?? 0, status: "failed", error: f.error })
        .run();
    }
    for (const a of result.answers) {
      await tx
        .insert(t.proposals)
        .values({ id: proposalRowId.get(a.answerId)!, sessionId, memberId: a.seatId, label: result.labels[a.answerId] ?? "?", text: a.text })
        .run();
    }
    for (const r of result.rankings) {
      const n = r.items.length;
      for (const i of r.items) {
        await tx
          .insert(t.rankings)
          .values({
            sessionId,
            reviewerMemberId: r.reviewerId,
            reviewerLabel: r.reviewerLabel,
            proposalId: proposalRowId.get(i.answerId)!,
            label: i.label,
            rank: i.rank,
            points: n - i.rank,
            correctness: i.correctness,
            reasoningQuality: i.reasoningQuality,
            usefulness: i.usefulness,
            risksCovered: i.risksCovered,
            reasoning: i.reasoning,
          })
          .run();
      }
    }
    if (result.verdict) {
      await tx.insert(t.verdicts).values({ sessionId, text: result.verdict, talmanId: talman.id, mode: result.effectiveMode }).run();
    }
    for (const v of result.finalVotes) {
      await tx
        .insert(t.votes)
        .values({ sessionId, memberId: v.seatId, choice: v.choice, explanation: v.explanation, weight: v.weight })
        .run();
    }
    for (const u of result.usage) await tx.insert(t.usage).values({ sessionId, ...u }).run();
  });
  return sessionId;
}

/** Vote wins per member id across all finished sessions. */
export async function memberWins(db: ParlamentDb): Promise<Record<string, number>> {
  const rows = await db.select({ id: t.sessions.winnerMemberId }).from(t.sessions).where(eq(t.sessions.state, "done")).all();
  const wins: Record<string, number> = {};
  for (const r of rows) if (r.id) wins[r.id] = (wins[r.id] ?? 0) + 1;
  return wins;
}
