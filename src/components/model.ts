// One view model for a debate, built either from live server-sent events or from a saved session.
import type { StreamEvent } from "../server/runtime";
import type { MemberView, RankingView, SessionDetailView, TallyView } from "../core/view";
import type { SessionState } from "../core/orchestrator";
import type { FinalVoteTally } from "../core/riksdag";
import type { CallStatus, SessionFormat, VoteChoice, VotingMode } from "../core/types";

export type Stage = SessionState;

export interface StatementState {
  text: string;
  status: "pending" | "streaming" | "done" | "failed";
  error?: string;
  /** Before any text: where the call is (queued, sent, thinking, waiting to retry). */
  phase?: CallStatus;
}

export interface VoteState {
  choice: VoteChoice | "franvarande";
  explanation: string;
  weight: number;
}

export interface SessionMeta {
  format: SessionFormat;
  /** The debaters (every party leader, or the two of a 1-mot-1 debate in speaking order). */
  seats: MemberView[];
  talman: MemberView;
  mode: VotingMode;
  /** Rebuttal rounds after the opening. */
  rounds: number;
  /** "2026/27" (empty for sessions stored before numbering existed). */
  riksmote: string;
  number: number;
  createdAt: string | null;
}

export interface SessionModel extends SessionMeta {
  effectiveMode: VotingMode;
  stage: Stage;
  /** The round being spoken right now (0 = opening). */
  round: number;
  /** round -> member id -> statement. */
  statements: Record<number, Record<string, StatementState>>;
  rankings: RankingView[];
  failedReviewers: { seatId: string; error: string }[];
  tally: TallyView | null;
  labels: { label: string; seatId: string }[];
  verdict: string;
  /** Main vote, member id -> vote (filled as votes come in). */
  votes: Record<string, VoteState>;
  finalTally: FinalVoteTally | null;
  /** 1-mot-1: the winner the Speaker named. */
  winnerSeatId: string | null;
  costUsd: number;
  error: string | null;
  saved: boolean;
  /** Latest notice while waiting (e.g. rate limiting); cleared when progress resumes. */
  notice: string | null;
}

export function initialModel(meta: SessionMeta): SessionModel {
  return {
    ...meta,
    effectiveMode: meta.mode,
    stage: "opening",
    round: 0,
    statements: {},
    rankings: [],
    failedReviewers: [],
    tally: null,
    labels: [],
    verdict: "",
    votes: {},
    finalTally: null,
    winnerSeatId: null,
    costUsd: 0,
    error: null,
    saved: false,
    notice: null,
  };
}

function setStatement(m: SessionModel, round: number, seatId: string, f: (prev: StatementState) => StatementState): SessionModel {
  const roundMap = m.statements[round] ?? {};
  const prev = roundMap[seatId] ?? { text: "", status: "pending" as const };
  return { ...m, statements: { ...m.statements, [round]: { ...roundMap, [seatId]: f(prev) } } };
}

export function reduce(m: SessionModel, e: StreamEvent): SessionModel {
  switch (e.type) {
    case "state":
      return { ...m, stage: e.state, notice: e.state === "done" || e.state === "failed" ? null : m.notice };
    case "round":
      return { ...m, round: e.round };
    case "statement_delta":
      return { ...setStatement(m, e.round, e.seatId, (p) => ({ text: p.text + e.text, status: "streaming" })), notice: null };
    case "statement_done":
      return { ...setStatement(m, e.round, e.seatId, (p) => ({ ...p, status: "done", phase: undefined })), notice: null };
    case "statement_status":
      // Only a speech that has not started writing shows its phase.
      return setStatement(m, e.round, e.seatId, (p) => (p.status === "pending" ? { ...p, phase: e.status } : p));
    case "notice":
      return { ...m, notice: e.text };
    case "statement_failed":
      return setStatement(m, e.round, e.seatId, () => ({ text: "", status: "failed", error: e.error }));
    case "labels":
      return { ...m, labels: e.labels };
    case "ranking_done":
      return { ...m, notice: null, rankings: [...m.rankings, { reviewerSeatId: e.reviewerId, reviewerLabel: e.reviewerLabel, items: e.items }] };
    case "ranking_failed":
      return { ...m, failedReviewers: [...m.failedReviewers, { seatId: e.reviewerId, error: e.error }] };
    case "tally":
      return { ...m, tally: e.tally };
    case "cost":
      return { ...m, costUsd: e.totalUsd };
    case "verdict_delta":
      // A full vote that reaches the decision without a tally means the Speaker decided alone.
      return { ...m, notice: null, verdict: m.verdict + e.text, effectiveMode: m.mode === "full" && !m.tally ? "chairman" : m.effectiveMode };
    case "vote_done":
      return { ...m, notice: null, votes: { ...m.votes, [e.seatId]: { choice: e.choice, explanation: e.explanation, weight: e.weight } } };
    case "vote_result":
      return { ...m, votes: Object.fromEntries(e.votes.map((v) => [v.seatId, v])), finalTally: e.tally };
    case "duel_result":
      return { ...m, winnerSeatId: e.winnerSeatId };
    case "saved":
      return { ...m, saved: true };
    case "error":
      return { ...m, stage: "failed", error: e.message };
    default:
      return m;
  }
}

/** The round in which a member failed and dropped out, if any. */
export function droppedIn(m: Pick<SessionModel, "statements">, seatId: string): number | null {
  for (const [round, map] of Object.entries(m.statements)) {
    if (map[seatId]?.status === "failed") return Number(round);
  }
  return null;
}

export interface Anforande {
  round: number;
  seat: MemberView;
  /** "Anf. N" as in the record; null for a speech that never came. */
  anf: number | null;
  statement: StatementState;
}

/**
 * Every speech in the order of the speakers' list: round by round, members in their order. Numbering runs on
 * across rounds like the record's "Anf." numbers; members who dropped out are left out of later rounds.
 */
export function anforanden(m: Pick<SessionModel, "seats" | "rounds" | "statements">): Anforande[] {
  const out: Anforande[] = [];
  let n = 0;
  for (let round = 0; round <= m.rounds; round++) {
    for (const seat of m.seats) {
      const dropped = droppedIn(m, seat.id);
      if (dropped !== null && dropped < round) continue;
      const statement = m.statements[round]?.[seat.id] ?? { text: "", status: "pending" as const };
      out.push({ round, seat, anf: statement.status === "failed" ? null : ++n, statement });
    }
  }
  return out;
}

/** Whose speech to feature once the debate is over: the 1-mot-1 winner, or the member behind the winning proposal. */
export const winnerOf = (m: Pick<SessionModel, "winnerSeatId" | "tally">) => m.winnerSeatId ?? m.tally?.winnerSeatId ?? null;

export const isLive = (m: Pick<SessionModel, "saved" | "stage">) => !m.saved && m.stage !== "failed" && m.stage !== "done";

export function modelFromDetail(d: SessionDetailView): SessionModel {
  const statements: SessionModel["statements"] = {};
  for (const s of d.statements) {
    statements[s.round] ??= {};
    statements[s.round]![s.seatId] =
      s.status === "ok" ? { text: s.text ?? "", status: "done" } : { text: "", status: "failed", error: s.error ?? "Misslyckades" };
  }
  return {
    format: d.format,
    seats: d.seats,
    talman: d.talman,
    mode: d.mode,
    rounds: d.rounds,
    riksmote: d.riksmote,
    number: d.number,
    createdAt: d.createdAt,
    effectiveMode: d.effectiveMode,
    stage: d.state === "done" ? "done" : "failed",
    round: d.rounds,
    statements,
    rankings: d.rankings,
    failedReviewers: [],
    tally: d.tally,
    labels: d.labels,
    verdict: d.verdict ?? "",
    votes: Object.fromEntries(d.finalVotes.map((v) => [v.seatId, { choice: v.choice, explanation: v.explanation, weight: v.weight }])),
    finalTally: d.finalTally,
    winnerSeatId: d.format === "duell" ? (d.winner?.id ?? null) : null,
    costUsd: d.totalCostUsd,
    error: d.error,
    saved: true,
    notice: null,
  };
}
