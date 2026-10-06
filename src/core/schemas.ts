import { z } from "zod";
import type { ReviewItem } from "./types";

const score = z.number().int().min(1).max(5);

export const reviewItemSchema = z.object({
  label: z.string().min(1),
  rank: z.number().int().min(1),
  correctness: score,
  reasoning_quality: score,
  usefulness: score,
  risks_covered: score,
  reasoning: z.string().min(1),
});

export const rankingSchema = z.object({ ranking: z.array(reviewItemSchema).min(1) });

/**
 * Hand-written JSON schema for output_config.format (kept free of min/max keywords, which structured
 * outputs do not accept). Zod validates the ranges after the fact.
 */
export const RANKING_JSON_SCHEMA = {
  type: "object",
  properties: {
    ranking: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          rank: { type: "integer" },
          correctness: { type: "integer" },
          reasoning_quality: { type: "integer" },
          usefulness: { type: "integer" },
          risks_covered: { type: "integer" },
          reasoning: { type: "string" },
        },
        required: ["label", "rank", "correctness", "reasoning_quality", "usefulness", "risks_covered", "reasoning"],
        additionalProperties: false,
      },
    },
  },
  required: ["ranking"],
  additionalProperties: false,
} as const;

export class InvalidRankingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRankingError";
  }
}

/** Parses and validates a reviewer's JSON against the labels it was actually shown. */
export function parseRanking(raw: string, expectedLabels: string[]): ReviewItem[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new InvalidRankingError("ranking is not valid JSON");
  }
  const parsed = rankingSchema.safeParse(json);
  if (!parsed.success) throw new InvalidRankingError(`ranking schema mismatch: ${parsed.error.message}`);

  const items = parsed.data.ranking;
  const labels = items.map((i) => i.label);
  if (new Set(labels).size !== labels.length) throw new InvalidRankingError("duplicate labels in ranking");
  if (labels.length !== expectedLabels.length || !expectedLabels.every((l) => labels.includes(l))) {
    throw new InvalidRankingError(`ranking must cover exactly ${expectedLabels.join(", ")}`);
  }
  const ranks = items.map((i) => i.rank).sort((a, b) => a - b);
  if (!ranks.every((r, idx) => r === idx + 1)) throw new InvalidRankingError("ranks must be 1..N with no gaps");

  return items
    .map((i) => ({
      label: i.label,
      rank: i.rank,
      correctness: i.correctness,
      reasoningQuality: i.reasoning_quality,
      usefulness: i.usefulness,
      risksCovered: i.risks_covered,
      reasoning: i.reasoning,
    }))
    .sort((a, b) => a.rank - b.rank);
}
