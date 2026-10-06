import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { MemberView } from "../core/view";

const now = () => new Date();

/** Every version of every member file a session has used, keyed by content hash. */
export const members = sqliteTable(
  "members",
  {
    id: text("id").notNull(),
    hash: text("hash").notNull(),
    name: text("name").notNull(),
    party: text("party").notNull(),
    short: text("short").notNull(),
    color: text("color").notNull(),
    role: text("role").notNull(),
    persona: text("persona").notNull(),
    model: text("model").notNull(),
    effort: text("effort").notNull(),
    file: text("file").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.id, t.hash] })],
);

export const briefs = sqliteTable("briefs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  /** The members as they were when this session ran, in display order. */
  seats: text("seats", { mode: "json" }).$type<(MemberView & { hash: string })[]>().notNull(),
  talman: text("talman", { mode: "json" }).$type<MemberView & { hash: string }>().notNull(),
  rounds: integer("rounds").notNull(),
  briefId: text("brief_id"),
  /** Snapshot so a session keeps the brief it actually saw, and when that brief was last edited. */
  briefContent: text("brief_content"),
  briefUpdatedAt: integer("brief_updated_at", { mode: "timestamp_ms" }),
  mode: text("mode").notNull(),
  effectiveMode: text("effective_mode").notNull(),
  state: text("state").notNull(),
  error: text("error"),
  winnerMemberId: text("winner_member_id"),
  marginFraction: real("margin_fraction"),
  closeRace: integer("close_race", { mode: "boolean" }),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

/** Everything said in the debate, one row per member per round. */
export const statements = sqliteTable("statements", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  memberId: text("member_id").notNull(),
  round: integer("round").notNull(),
  text: text("text"),
  status: text("status").notNull(), // ok | failed
  error: text("error"),
});

/** The final proposal of each member that made it to the vote. */
export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  memberId: text("member_id").notNull(),
  /** Neutral label the Speaker saw (A, B, ...). */
  label: text("label").notNull(),
  text: text("text").notNull(),
});

export const rankings = sqliteTable("rankings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  reviewerMemberId: text("reviewer_member_id").notNull(),
  /** "Ledamot N" as the Speaker saw it. */
  reviewerLabel: text("reviewer_label").notNull(),
  proposalId: text("proposal_id").notNull(),
  /** The label this voter saw (their own shuffle). */
  label: text("label").notNull(),
  rank: integer("rank").notNull(),
  points: integer("points").notNull(),
  correctness: integer("correctness").notNull(),
  reasoningQuality: integer("reasoning_quality").notNull(),
  usefulness: integer("usefulness").notNull(),
  risksCovered: integer("risks_covered").notNull(),
  reasoning: text("reasoning").notNull(),
});

export const verdicts = sqliteTable("verdicts", {
  sessionId: text("session_id").primaryKey(),
  text: text("text").notNull(),
  talmanId: text("talman_id").notNull(),
  mode: text("mode").notNull(),
});

export const usage = sqliteTable("usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  stage: text("stage").notNull(),
  advisorId: text("advisor_id"),
  round: integer("round"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cacheReadTokens: integer("cache_read_tokens").notNull(),
  cacheWriteTokens: integer("cache_write_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  stopReason: text("stop_reason"),
  fellBack: integer("fell_back", { mode: "boolean" }).notNull(),
});
