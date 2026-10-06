import { LIMITS } from "../config/models";
import type { ReviewItem } from "./types";

export interface Review {
  reviewer: string;
  /** Items keyed by canonical answer id (not the per-reviewer label). */
  items: { answerId: string; rank: number }[];
}

export interface TallyEntry {
  answerId: string;
  points: number;
  maxPossible: number;
  fraction: number;
}

export interface Tally {
  entries: TallyEntry[]; // best first
  winnerId: string | null;
  runnerUpId: string | null;
  /** Gap between first and second as a fraction of the maximum possible score. */
  marginFraction: number;
  closeRace: boolean;
  /** Exact tie for first: the chairman decides. */
  tie: boolean;
}

/**
 * Borda count. With N ranked answers, first place gets N-1 points and last gets 0.
 * Answers can be reviewed by different numbers of reviewers (an author never reviews its own answer, and
 * reviewers can fail), so entries are ordered by points as a fraction of the points available to them.
 */
export function bordaCount(
  answerIds: string[],
  reviews: Review[],
  closeRaceFraction: number = LIMITS.closeRaceFraction,
): Tally {
  const points = new Map<string, number>(answerIds.map((id) => [id, 0]));
  const max = new Map<string, number>(answerIds.map((id) => [id, 0]));

  for (const review of reviews) {
    const n = review.items.length;
    for (const item of review.items) {
      if (!points.has(item.answerId)) throw new Error(`Unknown answer id in review: ${item.answerId}`);
      points.set(item.answerId, points.get(item.answerId)! + (n - item.rank));
      max.set(item.answerId, max.get(item.answerId)! + (n - 1));
    }
  }

  const entries: TallyEntry[] = answerIds
    .map((answerId) => {
      const maxPossible = max.get(answerId)!;
      const p = points.get(answerId)!;
      return { answerId, points: p, maxPossible, fraction: maxPossible > 0 ? p / maxPossible : 0 };
    })
    .sort((a, b) => b.fraction - a.fraction || b.points - a.points);

  const first = entries[0];
  const second = entries[1];
  if (!first || !second || first.maxPossible === 0) {
    return { entries, winnerId: null, runnerUpId: null, marginFraction: 0, closeRace: true, tie: true };
  }
  const marginFraction = first.fraction - second.fraction;
  const tie = Math.abs(marginFraction) < 1e-9;
  return {
    entries,
    winnerId: tie ? null : first.answerId,
    runnerUpId: second.answerId,
    marginFraction,
    closeRace: tie || marginFraction <= closeRaceFraction + 1e-9,
    tie,
  };
}

export function toReview(reviewer: string, items: ReviewItem[], labelToAnswerId: Map<string, string>): Review {
  return {
    reviewer,
    items: items.map((i) => {
      const answerId = labelToAnswerId.get(i.label);
      if (!answerId) throw new Error(`Label ${i.label} is not mapped to an answer`);
      return { answerId, rank: i.rank };
    }),
  };
}
