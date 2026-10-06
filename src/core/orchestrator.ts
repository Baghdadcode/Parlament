import { DEBATE_ROUNDS, minSurvivors } from "../config/models";
import { anonymizeFor, LABELS } from "./anonymize";
import { bordaCount, toReview, type Review, type Tally } from "./borda";
import { sumCost } from "./cost";
import { DEFAULT_TALMAN, speakerName } from "../members/load";
import { extractProposal } from "../members/prompts";
import { annotateLabels, tallyVotes, voteWeight, type FinalVote, type FinalVoteTally } from "./riksdag";
import type {
  LabeledAnswer,
  MemberDef,
  ParlamentProvider,
  ReviewItem,
  TallyView,
  TranscriptEntry,
  UsageRecord,
  VoteChoice,
  VotingMode,
} from "./types";

export type SessionState = "opening" | "debating" | "ranking" | "counting" | "synthesizing" | "voting" | "done" | "failed";

export type SessionEvent =
  | { type: "state"; state: SessionState }
  | { type: "round"; round: number }
  | { type: "statement_delta"; seatId: string; round: number; text: string }
  | { type: "statement_done"; seatId: string; round: number }
  | { type: "statement_failed"; seatId: string; round: number; error: string }
  | { type: "labels"; labels: { label: string; seatId: string }[] }
  | {
      type: "ranking_done";
      reviewerId: string;
      reviewerLabel: string;
      items: { answerSeatId: string; rank: number; reasoning: string }[];
    }
  | { type: "ranking_failed"; reviewerId: string; error: string }
  | { type: "tally"; tally: TallyEvent }
  | { type: "cost"; totalUsd: number }
  | { type: "verdict_delta"; text: string }
  | { type: "vote_done"; seatId: string; choice: VoteChoice; explanation: string; weight: number }
  | { type: "vote_failed"; seatId: string; error: string }
  | { type: "vote_result"; votes: FinalVote[]; tally: FinalVoteTally };

export interface TallyEvent {
  entries: { seatId: string; points: number; maxPossible: number; fraction: number }[];
  winnerSeatId: string | null;
  marginFraction: number;
  closeRace: boolean;
  tie: boolean;
}

export interface SessionInput {
  question: string;
  brief?: string;
  members: MemberDef[];
  mode: VotingMode;
  /** Rebuttal rounds after the opening (default DEBATE_ROUNDS). */
  rounds?: number;
  talman?: MemberDef;
  onEvent?: (e: SessionEvent) => void;
  rng?: () => number;
}

export interface SeatStatement {
  seatId: string;
  round: number;
  text: string;
}

/** A member's final proposal: what goes to the vote. */
export interface SeatAnswer {
  answerId: string;
  seatId: string;
  text: string;
}

export interface SeatRanking {
  reviewerId: string;
  /** "Ledamot N" as the Speaker saw it (numbered in the order rankings came back). */
  reviewerLabel: string;
  /** Items in the reviewer's own labels, plus the canonical answer each label pointed to. */
  items: (ReviewItem & { answerId: string })[];
}

export interface SessionResult {
  state: "done" | "failed";
  mode: VotingMode;
  /** Mode actually used; a full vote falls back to the Speaker deciding when no ranking survives. */
  effectiveMode: VotingMode;
  rounds: number;
  error?: string;
  statements: SeatStatement[];
  answers: SeatAnswer[];
  /** Neutral label (A, B, ...) the Speaker saw for each answer id. */
  labels: Record<string, string>;
  failedSeats: { seatId: string; stage: "speak" | "rank" | "vote"; round?: number; error: string }[];
  rankings: SeatRanking[];
  tally?: Tally;
  winnerSeatId?: string | null;
  verdict?: string;
  /** The open main vote on the Speaker's proposal, one entry per member (absent members included). */
  finalVotes: FinalVote[];
  finalTally?: FinalVoteTally;
  usage: UsageRecord[];
  totalCostUsd: number;
}

export async function runSession(input: SessionInput, provider: ParlamentProvider): Promise<SessionResult> {
  const emit = input.onEvent ?? (() => undefined);
  const talman = input.talman ?? DEFAULT_TALMAN;
  const rounds = Math.max(0, input.rounds ?? DEBATE_ROUNDS);
  const usage: UsageRecord[] = [];
  const failedSeats: SessionResult["failedSeats"] = [];
  const result: SessionResult = {
    state: "failed",
    mode: input.mode,
    effectiveMode: input.mode,
    rounds,
    statements: [],
    answers: [],
    labels: {},
    failedSeats,
    rankings: [],
    finalVotes: [],
    usage,
    totalCostUsd: 0,
  };
  const record = (u: UsageRecord[]) => {
    usage.push(...u);
    emit({ type: "cost", totalUsd: sumCost(usage) });
  };
  const finish = (state: "done" | "failed", error?: string): SessionResult => {
    result.state = state;
    result.error = error;
    result.totalCostUsd = sumCost(usage);
    emit({ type: "state", state });
    return result;
  };
  const needed = minSurvivors(input.members.length);

  try {
    // 1 + 2. Opening statements, then rebuttal rounds. Each round runs in parallel; everyone sees all earlier rounds.
    let active = [...input.members];
    const lastText = new Map<string, string>();
    for (let round = 0; round <= rounds; round++) {
      if (round === 0) emit({ type: "state", state: "opening" });
      else if (round === 1) emit({ type: "state", state: "debating" });
      emit({ type: "round", round });

      const transcript: TranscriptEntry[] = result.statements.map((s) => {
        const m = input.members.find((x) => x.id === s.seatId)!;
        return { round: s.round, memberId: s.seatId, speaker: speakerName(m), text: s.text };
      });
      const settled = await Promise.allSettled(
        active.map(async (member) => {
          try {
            const r = await provider.speak({
              member,
              question: input.question,
              brief: input.brief,
              round,
              totalRounds: rounds,
              address: talman.address,
              transcript,
              onText: (text) => emit({ type: "statement_delta", seatId: member.id, round, text }),
            });
            record(r.usage);
            emit({ type: "statement_done", seatId: member.id, round });
            return { member, text: r.value };
          } catch (err) {
            const error = errorMessage(err);
            failedSeats.push({ seatId: member.id, stage: "speak", round, error });
            emit({ type: "statement_failed", seatId: member.id, round, error });
            throw err;
          }
        }),
      );
      const spoke: MemberDef[] = [];
      // Keep the members' display order rather than completion order.
      for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        result.statements.push({ seatId: s.value.member.id, round, text: s.value.text });
        lastText.set(s.value.member.id, s.value.text);
        spoke.push(s.value.member);
      }
      active = spoke;
      if (active.length < needed) {
        return finish(
          "failed",
          `Bara ${active.length} ledamöter kunde tala i ${round === 0 ? "anförandena" : `replikskifte ${round}`}; minst ${needed} behövs.`,
        );
      }
    }

    // The final proposal of every member still standing is what goes to the vote.
    const answers: SeatAnswer[] = active.map((m) => ({
      answerId: `ans-${m.id}`,
      seatId: m.id,
      text: extractProposal(lastText.get(m.id)!, rounds),
    }));
    result.answers = answers;
    if (answers.length > LABELS.length) return finish("failed", "För många förslag att märka");

    const memberById = new Map(input.members.map((m) => [m.id, m]));

    // The Speaker sees one canonical, neutral labelling (the same for every call it makes).
    const canonical = answers.map((a, i) => ({ ...a, label: LABELS[i]! }));
    const canonicalLabel = new Map(canonical.map((a) => [a.answerId, a.label]));
    result.labels = Object.fromEntries(canonical.map((a) => [a.answerId, a.label]));
    emit({ type: "labels", labels: canonical.map((a) => ({ label: a.label, seatId: a.seatId })) });
    const seatOfAnswer = new Map(answers.map((a) => [a.answerId, a.seatId]));
    // The Speaker reads the proposals with every name and party removed, like the voters do.
    const chairAnswers: LabeledAnswer[] = anonymizeFor({ id: "" }, answers, input.members, () => 0)
      .presented.map((p) => ({ label: canonicalLabel.get(p.answerId)!, text: p.text }))
      .sort((a, b) => a.label.localeCompare(b.label));

    let tally: Tally | undefined;
    let reviewsForChair: { reviewer: string; items: ReviewItem[] }[] = [];
    let effectiveMode = input.mode;

    if (input.mode === "full") {
      // 3. Blind vote: fresh order per voter, own proposal excluded, names and parties redacted.
      emit({ type: "state", state: "ranking" });
      const reviews: Review[] = [];
      await Promise.all(
        answers.map(async (reviewerAnswer) => {
          const reviewer = memberById.get(reviewerAnswer.seatId)!;
          const anon = anonymizeFor(reviewer, answers, input.members, input.rng);
          try {
            const r = await provider.rank({
              reviewer,
              question: input.question,
              brief: input.brief,
              answers: anon.presented.map((p) => ({ label: p.label, text: p.text })),
            });
            record(r.usage);
            reviews.push(toReview(reviewer.id, r.value.items, anon.labelToAnswerId));
            const reviewerLabel = `Ledamot ${result.rankings.length + 1}`;
            const items = r.value.items.map((i) => ({ ...i, answerId: anon.labelToAnswerId.get(i.label)! }));
            result.rankings.push({ reviewerId: reviewer.id, reviewerLabel, items });
            emit({
              type: "ranking_done",
              reviewerId: reviewer.id,
              reviewerLabel,
              items: items.map((i) => ({ answerSeatId: seatOfAnswer.get(i.answerId)!, rank: i.rank, reasoning: i.reasoning })),
            });
          } catch (err) {
            const error = errorMessage(err);
            failedSeats.push({ seatId: reviewer.id, stage: "rank", error });
            emit({ type: "ranking_failed", reviewerId: reviewer.id, error });
          }
        }),
      );

      // 4. Count.
      emit({ type: "state", state: "counting" });
      if (reviews.length === 0) {
        effectiveMode = "chairman"; // nothing to count; the Speaker decides
      } else {
        tally = bordaCount(
          answers.map((a) => a.answerId),
          reviews,
        );
        result.tally = tally;
        result.winnerSeatId = tally.winnerId ? answers.find((a) => a.answerId === tally!.winnerId)?.seatId : null;
        emit({
          type: "tally",
          tally: {
            entries: tally.entries.map((e) => ({
              seatId: seatOfAnswer.get(e.answerId)!,
              points: e.points,
              maxPossible: e.maxPossible,
              fraction: e.fraction,
            })),
            winnerSeatId: result.winnerSeatId ?? null,
            marginFraction: tally.marginFraction,
            closeRace: tally.closeRace,
            tie: tally.tie,
          },
        });
        // Present each voter to the Speaker neutrally, translated to the canonical answer labels.
        reviewsForChair = result.rankings.map((r) => ({
          reviewer: r.reviewerLabel,
          items: r.items
            .map((i) => ({ ...i, label: canonicalLabel.get(i.answerId)! }))
            .sort((a, b) => a.rank - b.rank),
        }));
      }
    }
    result.effectiveMode = effectiveMode;

    // 5. The Speaker writes the decision; a separate call that does not vote.
    emit({ type: "state", state: "synthesizing" });
    const tallyView: TallyView | undefined = tally && {
      scores: tally.entries.map((e) => ({
        label: canonicalLabel.get(e.answerId)!,
        points: e.points,
        maxPossible: e.maxPossible,
        fraction: e.fraction,
      })),
      winnerLabel: tally.winnerId ? canonicalLabel.get(tally.winnerId)! : null,
      marginFraction: tally.marginFraction,
      closeRace: tally.closeRace,
      tie: tally.tie,
    };
    const verdict = await provider.synthesize({
      talman,
      question: input.question,
      brief: input.brief,
      mode: effectiveMode,
      answers: chairAnswers,
      reviews: reviewsForChair,
      tally: tallyView,
      onText: (text) => emit({ type: "verdict_delta", text }),
    });
    record(verdict.usage);
    result.verdict = verdict.value;

    // 6. Huvudvotering: an open vote on the Speaker's proposal; each member votes with their party's seats.
    emit({ type: "state", state: "voting" });
    const decisionForVoters = annotateLabels(
      verdict.value,
      canonical.map((a) => ({ label: a.label, short: memberById.get(a.seatId)!.short })),
    );
    const finalVotes: FinalVote[] = [];
    const weight = (m: MemberDef) => voteWeight(m, input.members);
    await Promise.all(
      answers.map(async (a) => {
        const member = memberById.get(a.seatId)!;
        try {
          const r = await provider.vote({
            member,
            question: input.question,
            brief: input.brief,
            decision: decisionForVoters,
            ownProposal: a.text,
          });
          record(r.usage);
          finalVotes.push({ seatId: member.id, choice: r.value.choice, explanation: r.value.explanation, weight: weight(member) });
          emit({ type: "vote_done", seatId: member.id, choice: r.value.choice, explanation: r.value.explanation, weight: weight(member) });
        } catch (err) {
          const error = errorMessage(err);
          failedSeats.push({ seatId: member.id, stage: "vote", error });
          emit({ type: "vote_failed", seatId: member.id, error });
        }
      }),
    );
    // Members who dropped out of the debate, or whose vote failed, count as absent (frånvarande).
    result.finalVotes = input.members.map(
      (m) =>
        finalVotes.find((v) => v.seatId === m.id) ?? {
          seatId: m.id,
          choice: "franvarande" as const,
          explanation: "Frånvarande vid voteringen.",
          weight: weight(m),
        },
    );
    result.finalTally = tallyVotes(result.finalVotes);
    emit({ type: "vote_result", votes: result.finalVotes, tally: result.finalTally });
    return finish("done");
  } catch (err) {
    return finish("failed", errorMessage(err));
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
