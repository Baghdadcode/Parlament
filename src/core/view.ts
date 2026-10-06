// Plain, JSON-safe shapes shared by the server routes and the browser UI.
import type { MemberDef, VotingMode } from "./types";

export interface MemberView {
  id: string;
  name: string;
  party: string;
  short: string;
  color: string;
  model: string;
  effort: string;
}

export const toMemberView = (m: MemberDef): MemberView => ({
  id: m.id,
  name: m.name,
  party: m.party,
  short: m.short,
  color: m.color,
  model: m.model,
  effort: m.effort,
});

export interface BriefView {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface TallyView {
  entries: { seatId: string; points: number; maxPossible: number; fraction: number }[];
  winnerSeatId: string | null;
  marginFraction: number;
  closeRace: boolean;
  tie: boolean;
}

export interface RankingView {
  reviewerSeatId: string;
  reviewerLabel: string;
  items: { answerSeatId: string; rank: number; reasoning: string }[];
}

export interface StatementView {
  seatId: string;
  round: number;
  text: string | null;
  status: string;
  error: string | null;
}

export interface SessionSummaryView {
  id: string;
  question: string;
  mode: VotingMode;
  rounds: number;
  state: string;
  winner: MemberView | null;
  closeRace: boolean | null;
  totalCostUsd: number;
  createdAt: string;
}

export interface SessionDetailView extends SessionSummaryView {
  effectiveMode: VotingMode;
  error: string | null;
  finishedAt: string | null;
  brief: { id: string; name: string; updatedAt: string } | null;
  seats: MemberView[];
  talman: MemberView;
  statements: StatementView[];
  /** Neutral label of each member's final proposal. */
  labels: { label: string; seatId: string }[];
  rankings: RankingView[];
  tally: TallyView | null;
  verdict: string | null;
  usage: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };
}

/** Splits the Speaker's decision into the decision itself and the reservations (if any). */
export function splitVerdict(verdict: string): { main: string; minority: string | null } {
  const text = `\n${verdict}`;
  const m = /\n#{1,6}\s*Reservation(?:er)?\s*:?\s*\n/i.exec(text);
  if (!m) return { main: verdict.trim(), minority: null };
  return { main: text.slice(0, m.index).trim(), minority: text.slice(m.index + m[0].length).trim() || null };
}
