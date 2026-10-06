import { randomUUID } from "node:crypto";
import { asc, desc, eq, max } from "drizzle-orm";
import type { ParlamentDb } from "./client";
import * as t from "./schema";
import { bordaCount } from "../core/borda";
import type { BriefView, MemberView, SessionDetailView, SessionSummaryView } from "../core/view";
import type { FinalVote } from "../core/riksdag";
import type { VotingMode } from "../core/types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Drops the hash and fills fields that sessions stored before they existed. */
const stripHash = ({ hash: _hash, ...m }: MemberView & { hash: string }, i = 0): MemberView => ({
  ...m,
  title: m.title ?? "Partiledare",
  seats: m.seats ?? 0,
  placement: m.placement ?? i,
});

const toBriefView = (b: typeof t.briefs.$inferSelect): BriefView => ({
  id: b.id,
  name: b.name,
  content: b.content,
  updatedAt: b.updatedAt.toISOString(),
});

export async function listBriefs(db: ParlamentDb): Promise<BriefView[]> {
  return (await db.select().from(t.briefs).orderBy(asc(t.briefs.name)).all()).map(toBriefView);
}

export async function getBrief(db: ParlamentDb, id: string): Promise<BriefView | null> {
  const b = await db.select().from(t.briefs).where(eq(t.briefs.id, id)).get();
  return b ? toBriefView(b) : null;
}

export async function saveBrief(
  db: ParlamentDb,
  input: { id?: string; name: string; content: string },
): Promise<BriefView> {
  const id = input.id ?? `${slug(input.name) || "bakgrund"}-${randomUUID().slice(0, 6)}`;
  const existing = input.id ? await db.select().from(t.briefs).where(eq(t.briefs.id, input.id)).get() : undefined;
  // Only an actual change counts as an edit, so a session's "last edited" date stays meaningful.
  if (existing && existing.name === input.name && existing.content === input.content) return toBriefView(existing);
  const updatedAt = new Date();
  await db
    .insert(t.briefs)
    .values({ id, name: input.name, content: input.content, updatedAt })
    .onConflictDoUpdate({ target: t.briefs.id, set: { name: input.name, content: input.content, updatedAt } })
    .run();
  return { id, name: input.name, content: input.content, updatedAt: updatedAt.toISOString() };
}

export async function deleteBrief(db: ParlamentDb, id: string): Promise<void> {
  await db.delete(t.briefs).where(eq(t.briefs.id, id)).run();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function toSummary(r: typeof t.sessions.$inferSelect): SessionSummaryView {
  const winner = r.winnerMemberId ? r.seats.find((s) => s.id === r.winnerMemberId) : undefined;
  return {
    id: r.id,
    question: r.question,
    riksmote: r.riksmote,
    number: r.number,
    mode: r.mode as VotingMode,
    rounds: r.rounds,
    state: r.state,
    winner: winner ? stripHash(winner) : null,
    closeRace: r.closeRace,
    totalCostUsd: r.totalCostUsd,
    createdAt: r.createdAt.toISOString(),
    finalTally: r.finalTally ?? null,
  };
}

/** Highest sitting number used in a riksmöte so far (0 when none). */
export async function maxSittingNumber(db: ParlamentDb, riksmote: string): Promise<number> {
  const row = await db.select({ n: max(t.sessions.number) }).from(t.sessions).where(eq(t.sessions.riksmote, riksmote)).get();
  return row?.n ?? 0;
}

export async function listSessions(db: ParlamentDb, limit = 100): Promise<SessionSummaryView[]> {
  const rows = await db.select().from(t.sessions).orderBy(desc(t.sessions.createdAt)).limit(limit).all();
  return rows.map(toSummary);
}

export async function getSessionDetail(db: ParlamentDb, id: string): Promise<SessionDetailView | null> {
  const s = await db.select().from(t.sessions).where(eq(t.sessions.id, id)).get();
  if (!s) return null;
  const briefRow = s.briefId ? await db.select({ name: t.briefs.name }).from(t.briefs).where(eq(t.briefs.id, s.briefId)).get() : undefined;
  const [statementRows, proposalRows, rankingRows, verdict, usageRows, voteRows] = await Promise.all([
    db.select().from(t.statements).where(eq(t.statements.sessionId, id)).all(),
    db.select().from(t.proposals).where(eq(t.proposals.sessionId, id)).orderBy(asc(t.proposals.label)).all(),
    db.select().from(t.rankings).where(eq(t.rankings.sessionId, id)).orderBy(asc(t.rankings.id)).all(),
    db.select().from(t.verdicts).where(eq(t.verdicts.sessionId, id)).get(),
    db.select().from(t.usage).where(eq(t.usage.sessionId, id)).all(),
    db.select().from(t.votes).where(eq(t.votes.sessionId, id)).orderBy(asc(t.votes.id)).all(),
  ]);

  const memberOfProposal = new Map(proposalRows.map((p) => [p.id, p.memberId]));
  const rankings = new Map<string, SessionDetailView["rankings"][number]>();
  for (const r of rankingRows) {
    const entry = rankings.get(r.reviewerMemberId) ?? { reviewerSeatId: r.reviewerMemberId, reviewerLabel: r.reviewerLabel, items: [] };
    entry.items.push({ answerSeatId: memberOfProposal.get(r.proposalId) ?? r.proposalId, rank: r.rank, reasoning: r.reasoning });
    rankings.set(r.reviewerMemberId, entry);
  }
  const rankingList = [...rankings.values()].map((r) => ({ ...r, items: r.items.sort((a, b) => a.rank - b.rank) }));

  let tally: SessionDetailView["tally"] = null;
  if (rankingList.length > 0 && proposalRows.length > 1) {
    const t2 = bordaCount(
      proposalRows.map((p) => p.memberId),
      rankingList.map((r) => ({ reviewer: r.reviewerSeatId, items: r.items.map((i) => ({ answerId: i.answerSeatId, rank: i.rank })) })),
    );
    tally = {
      entries: t2.entries.map((e) => ({ seatId: e.answerId, points: e.points, maxPossible: e.maxPossible, fraction: e.fraction })),
      winnerSeatId: t2.winnerId,
      marginFraction: t2.marginFraction,
      closeRace: t2.closeRace,
      tie: t2.tie,
    };
  }

  const order = new Map(s.seats.map((m, i) => [m.id, i]));
  return {
    ...toSummary(s),
    effectiveMode: s.effectiveMode as VotingMode,
    error: s.error,
    finishedAt: iso(s.finishedAt),
    brief: s.briefId && s.briefUpdatedAt ? { id: s.briefId, name: briefRow?.name ?? s.briefId, updatedAt: s.briefUpdatedAt.toISOString() } : null,
    seats: s.seats.map((m, i) => stripHash(m, i)),
    talman: stripHash(s.talman),
    statements: statementRows
      .map((r) => ({ seatId: r.memberId, round: r.round, text: r.text, status: r.status, error: r.error }))
      .sort((a, b) => a.round - b.round || (order.get(a.seatId) ?? 99) - (order.get(b.seatId) ?? 99)),
    labels: proposalRows.map((p) => ({ label: p.label, seatId: p.memberId })),
    rankings: rankingList,
    tally,
    verdict: verdict?.text ?? null,
    finalVotes: voteRows
      .map((v): FinalVote => ({ seatId: v.memberId, choice: v.choice as FinalVote["choice"], explanation: v.explanation, weight: v.weight }))
      .sort((a, b) => (order.get(a.seatId) ?? 99) - (order.get(b.seatId) ?? 99)),
    usage: {
      calls: usageRows.length,
      inputTokens: usageRows.reduce((n, u) => n + u.inputTokens, 0),
      outputTokens: usageRows.reduce((n, u) => n + u.outputTokens, 0),
      cacheReadTokens: usageRows.reduce((n, u) => n + u.cacheReadTokens, 0),
      cacheWriteTokens: usageRows.reduce((n, u) => n + u.cacheWriteTokens, 0),
      // The models that actually answered (a provider can substitute one, e.g. when a plan excludes a model).
      models: [...new Set(usageRows.map((u) => u.model))],
    },
  };
}
