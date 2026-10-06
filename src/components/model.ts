// One view model for a debate, built either from live server-sent events or from a saved session.
import type { StreamEvent } from "../server/runtime";
import type { MemberView, RankingView, SessionDetailView, TallyView } from "../core/view";
import type { SessionState } from "../core/orchestrator";
import type { VotingMode } from "../core/types";

export type Stage = SessionState;

export interface StatementState {
  text: string;
  status: "pending" | "streaming" | "done" | "failed";
  error?: string;
}

export interface SessionModel {
  seats: MemberView[];
  talman: MemberView;
  mode: VotingMode;
  effectiveMode: VotingMode;
  /** Rebuttal rounds after the opening. */
  rounds: number;
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
  costUsd: number;
  error: string | null;
  saved: boolean;
}

export function initialModel(seats: MemberView[], talman: MemberView, mode: VotingMode, rounds: number): SessionModel {
  return {
    seats,
    talman,
    mode,
    effectiveMode: mode,
    rounds,
    stage: "opening",
    round: 0,
    statements: {},
    rankings: [],
    failedReviewers: [],
    tally: null,
    labels: [],
    verdict: "",
    costUsd: 0,
    error: null,
    saved: false,
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
      return { ...m, stage: e.state };
    case "round":
      return { ...m, round: e.round };
    case "statement_delta":
      return setStatement(m, e.round, e.seatId, (p) => ({ text: p.text + e.text, status: "streaming" }));
    case "statement_done":
      return setStatement(m, e.round, e.seatId, (p) => ({ ...p, status: "done" }));
    case "statement_failed":
      return setStatement(m, e.round, e.seatId, () => ({ text: "", status: "failed", error: e.error }));
    case "labels":
      return { ...m, labels: e.labels };
    case "ranking_done":
      return { ...m, rankings: [...m.rankings, { reviewerSeatId: e.reviewerId, reviewerLabel: e.reviewerLabel, items: e.items }] };
    case "ranking_failed":
      return { ...m, failedReviewers: [...m.failedReviewers, { seatId: e.reviewerId, error: e.error }] };
    case "tally":
      return { ...m, tally: e.tally };
    case "cost":
      return { ...m, costUsd: e.totalUsd };
    case "verdict_delta":
      // A full vote that reaches the decision without a tally means the Speaker decided alone.
      return { ...m, verdict: m.verdict + e.text, effectiveMode: m.mode === "full" && !m.tally ? "chairman" : m.effectiveMode };
    case "saved":
      return { ...m, saved: true };
    case "error":
      return { ...m, stage: "failed", error: e.message };
    default:
      return m;
  }
}

/** The round in which a member failed and dropped out, if any. */
export function droppedIn(m: SessionModel, seatId: string): number | null {
  for (const [round, map] of Object.entries(m.statements)) {
    if (map[seatId]?.status === "failed") return Number(round);
  }
  return null;
}

export function modelFromDetail(d: SessionDetailView): SessionModel {
  const statements: SessionModel["statements"] = {};
  for (const s of d.statements) {
    statements[s.round] ??= {};
    statements[s.round]![s.seatId] =
      s.status === "ok" ? { text: s.text ?? "", status: "done" } : { text: "", status: "failed", error: s.error ?? "Misslyckades" };
  }
  return {
    seats: d.seats,
    talman: d.talman,
    mode: d.mode,
    effectiveMode: d.effectiveMode,
    rounds: d.rounds,
    stage: d.state === "done" ? "done" : "failed",
    round: d.rounds,
    statements,
    rankings: d.rankings,
    failedReviewers: [],
    tally: d.tally,
    labels: d.labels,
    verdict: d.verdict ?? "",
    costUsd: d.totalCostUsd,
    error: d.error,
    saved: true,
  };
}
