import { PRICING } from "../config/models";
import { billedPricing } from "./cost";
import type { MemberDef, VotingMode } from "./types";

/**
 * Rough token counts per call (Opus 5.5, medium effort; output includes thinking). Estimates are rough by design;
 * the real cost is recorded per call.
 */
const TYPICAL = {
  /** Persona + instructions. */
  system: 1_300,
  opening: { output: 2_200 },
  rebuttal: { output: 2_000 },
  /** Tokens one statement adds to the shared transcript. */
  statement: 650,
  /** A final proposal as a voter reads it. */
  proposal: 350,
  rank: { output: 900 },
  talman: { system: 900, output: 3_000, perReviewLine: 60 },
  /** Main vote: reads the Speaker's proposal and its own, answers with a short JSON. */
  vote: { decision: 1_000, output: 700 },
} as const;

export interface EstimateInput {
  members: Pick<MemberDef, "model">[];
  talman: Pick<MemberDef, "model">;
  mode: VotingMode;
  rounds: number;
  briefChars?: number;
  questionChars?: number;
}

const tokensFromChars = (chars: number) => Math.ceil(chars / 4);

/**
 * Shared blocks (the brief, and in rebuttal rounds the transcript) are cached: the parallel calls of a round
 * start together, so assume half of them write the cache and half read it.
 */
export function estimateSessionCost(input: EstimateInput): number {
  const briefTok = tokensFromChars(input.briefChars ?? 0);
  const questionTok = tokensFromChars(input.questionChars ?? 0);
  const price = (model: string) => billedPricing(model) ?? PRICING["claude-opus-5-5"]!;
  const call = (model: string, inTok: number, sharedTok: number, outTok: number) => {
    const p = price(model);
    const shared = sharedTok * (p.cacheWritePerMTok + p.cacheReadPerMTok) * 0.5;
    return (inTok * p.inputPerMTok + outTok * p.outputPerMTok + shared) / 1e6;
  };
  const n = input.members.length;
  let usd = 0;
  for (let round = 0; round <= input.rounds; round++) {
    const transcript = round === 0 ? 0 : n * TYPICAL.statement * round;
    const out = round === 0 ? TYPICAL.opening.output : TYPICAL.rebuttal.output;
    for (const m of input.members) usd += call(m.model, TYPICAL.system + questionTok, briefTok + transcript, out);
  }
  if (input.mode === "full") {
    for (const m of input.members) {
      usd += call(m.model, TYPICAL.system + questionTok + TYPICAL.proposal * (n - 1), briefTok, TYPICAL.rank.output);
    }
  }
  const reviews = input.mode === "full" ? n * (n - 1) * TYPICAL.talman.perReviewLine : 0;
  usd += call(input.talman.model, TYPICAL.talman.system + questionTok + TYPICAL.proposal * n + reviews, briefTok, TYPICAL.talman.output);
  for (const m of input.members) {
    usd += call(m.model, TYPICAL.system + questionTok + TYPICAL.vote.decision + TYPICAL.proposal, briefTok, TYPICAL.vote.output);
  }
  return usd;
}
