// Plain, JSON-safe shapes shared by the server routes and the browser UI.
import type { FinalVote, FinalVoteTally } from "./riksdag";
import type { MemberDef, SessionFormat, VotingMode } from "./types";

export interface MemberView {
  id: string;
  name: string;
  party: string;
  short: string;
  color: string;
  title: string;
  seats: number;
  placement: number;
  model: string;
  effort: string;
  /** One of your own members (members/egna/), not a party leader. */
  custom?: boolean;
}

export const toMemberView = (m: MemberDef): MemberView => ({
  id: m.id,
  name: m.name,
  party: m.party,
  short: m.short,
  color: m.color,
  title: m.title,
  seats: m.seats,
  placement: m.placement,
  model: m.model,
  effort: m.effort,
  ...(m.custom ? { custom: true } : {}),
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
  /** "2026/27" */
  riksmote: string;
  /** Sitting number within the riksmöte: "2026/27:14". */
  number: number;
  format: SessionFormat;
  mode: VotingMode;
  rounds: number;
  state: string;
  /** The winning proposal's member, or the 1-mot-1 winner the Speaker named. */
  winner: MemberView | null;
  closeRace: boolean | null;
  totalCostUsd: number;
  createdAt: string;
  finalTally: FinalVoteTally | null;
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
  finalVotes: FinalVote[];
  usage: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; models: string[] };
}

