import type { Effort, ModelId } from "../config/models";

export type MemberRole = "ledamot" | "talman";

/** One debater (a party leader) or the Speaker, loaded from a members/*.md file. */
export interface MemberDef {
  id: string;
  name: string;
  party: string;
  /** Party abbreviation, e.g. "S". */
  short: string;
  /** CSS colour for the UI. */
  color: string;
  role: MemberRole;
  enabled: boolean;
  order: number;
  /** Title on the name tag, e.g. "Partiordförande". */
  title: string;
  /** Riksdag seats: drawn in the chamber and used to weigh the main vote (0 = not set). */
  seats: number;
  /** Left-to-right place in the chamber diagram. */
  placement: number;
  /** How the Speaker is addressed ("Herr talman" / "Fru talman"); only read from the talman file. */
  address: string;
  /** The markdown body of the file (comments removed), sent verbatim as the persona. */
  persona: string;
  model: ModelId;
  effort: Effort;
  /** Short content hash: a session records exactly which version of the file it used. */
  hash: string;
  /** File name inside the members folder. */
  file: string;
}

export type Stage = "opening" | "debate" | "rank" | "synthesize" | "vote" | "judge";

export interface UsageRecord {
  stage: Stage;
  advisorId: string | null;
  /** Debate round (0 = opening) for opening/debate calls; null otherwise. */
  round: number | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  stopReason: string | null;
  fellBack: boolean;
}

export interface CallResult<T> {
  value: T;
  usage: UsageRecord[];
}

export interface SessionBrief {
  id: string;
  name: string;
  content: string;
  updatedAt: Date;
}

/** "full": blind vote, then the Speaker writes the decision. "chairman": the Speaker decides without a vote. */
export type VotingMode = "full" | "chairman";

/** "partiledardebatt": every leader debates and the chamber votes. "duell": two leaders, and the Speaker names the winner. */
export type SessionFormat = "partiledardebatt" | "duell";

/** One statement already made in the debate, attributed by name (the debate itself is open). */
export interface TranscriptEntry {
  round: number;
  memberId: string;
  /** "Magdalena Andersson (S)" */
  speaker: string;
  text: string;
}

/** Progress of one model call, so the UI can say why nothing has appeared yet. */
export type CallStatus =
  | { kind: "queued" }
  | { kind: "started" }
  | { kind: "thinking" }
  | { kind: "retrying"; reason: string; waitMs: number; attempt: number; maxAttempts: number }
  /** The key's plan does not include the model; the call continues on another one. */
  | { kind: "fallback"; from: string; to: string };

export interface SpeakRequest {
  member: MemberDef;
  question: string;
  brief?: string;
  /** 0 = opening statement, 1..totalRounds = rebuttal rounds. */
  round: number;
  totalRounds: number;
  /** How the Speaker is addressed, e.g. "Herr talman". */
  address?: string;
  /** Everything said before this speech; empty for the very first one. */
  transcript: TranscriptEntry[];
  /** Set in a 1-mot-1 debate: the only other debater. */
  opponent?: MemberDef;
  onText?: (delta: string) => void;
  onStatus?: (s: CallStatus) => void;
}

/** The Speaker decides who won a 1-mot-1 debate. */
export interface JudgeRequest {
  talman: MemberDef;
  question: string;
  brief?: string;
  /** In speaking order: the first speaker, then the second. */
  debaters: MemberDef[];
  transcript: TranscriptEntry[];
  onText?: (delta: string) => void;
  onStatus?: (s: CallStatus) => void;
}

export interface LabeledAnswer {
  label: string;
  text: string;
}

export interface RankRequest {
  reviewer: MemberDef;
  question: string;
  brief?: string;
  answers: LabeledAnswer[];
  onStatus?: (s: CallStatus) => void;
}

export interface ReviewItem {
  label: string;
  rank: number;
  correctness: number;
  reasoningQuality: number;
  usefulness: number;
  risksCovered: number;
  reasoning: string;
}

export interface RankingOutput {
  items: ReviewItem[];
}

/** Everything the Speaker sees, already mapped to one canonical set of labels. */
export interface SynthesizeRequest {
  talman: MemberDef;
  question: string;
  brief?: string;
  mode: VotingMode;
  answers: LabeledAnswer[];
  reviews: { reviewer: string; items: ReviewItem[] }[];
  tally?: TallyView;
  onText?: (delta: string) => void;
  onStatus?: (s: CallStatus) => void;
}

export interface TallyView {
  scores: { label: string; points: number; maxPossible: number; fraction: number }[];
  winnerLabel: string | null;
  marginFraction: number;
  closeRace: boolean;
  tie: boolean;
}

export type VoteChoice = "ja" | "nej" | "avstar";

/** The open main vote (huvudvotering) on the Speaker's proposed decision. */
export interface VoteRequest {
  member: MemberDef;
  question: string;
  brief?: string;
  /** The Speaker's proposal, with proposal letters annotated with their parties. */
  decision: string;
  /** The member's own final proposal from the debate. */
  ownProposal: string;
  onStatus?: (s: CallStatus) => void;
}

export interface VoteOutput {
  choice: VoteChoice;
  /** Röstförklaring: one or two sentences. */
  explanation: string;
}

/** The provider interface; other providers can be added without touching the orchestrator. */
export interface ParlamentProvider {
  speak(req: SpeakRequest): Promise<CallResult<string>>;
  judge(req: JudgeRequest): Promise<CallResult<string>>;
  rank(req: RankRequest): Promise<CallResult<RankingOutput>>;
  synthesize(req: SynthesizeRequest): Promise<CallResult<string>>;
  vote(req: VoteRequest): Promise<CallResult<VoteOutput>>;
}
