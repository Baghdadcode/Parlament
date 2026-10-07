// Presents a live sitting one speech at a time, whatever order and speed the speeches actually arrive in: each speech
// is revealed word by word at the rostrum, stays up for a pause, and then the next speaker in the speakers' list
// takes over. Later stages (the vote, the Speaker's decision or judgment) appear once every speech has been shown.
import { wordCount } from "../core/riksdag";
import { anfKey, anforanden, type SessionModel, type StatementState } from "./model";

/** Time per revealed word: about 6 words a second, slow enough to read along. */
export const WORD_MS = 160;
/** How long a finished speech stays up before the next speaker. */
export const PAUSE_MS = 5000;
/** A speech that never came is shown briefly as such. */
export const FAILED_PAUSE_MS = 1500;

export interface Cursor {
  /** The speech at the rostrum ("round:seatId"). */
  key: string;
  /** Words of it shown so far. */
  words: number;
  /** Set once the whole speech is shown: when to move on. */
  pauseUntil?: number;
}

/** Where playback starts; null when there is nothing to present (a stored or failed sitting). */
export function startCursor(m: SessionModel): Cursor | null {
  const first = anforanden(m)[0];
  return first && m.stage !== "failed" ? { key: anfKey(first), words: 0 } : null;
}

/** The first `n` words of a text, keeping its own spacing and line breaks. */
export function firstWords(text: string, n: number): string {
  if (n <= 0) return "";
  const parts = text.split(/(\s+)/);
  let words = 0;
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$/.test(p)) {
      out += p;
      continue;
    }
    if (words === n) break;
    out += p;
    words++;
  }
  return out.trimEnd();
}

/**
 * One step of playback. Returns the next cursor, or null when every speech has been presented (or the sitting
 * failed), after which the sitting is shown as it really stands.
 */
export function tick(cur: Cursor | null, m: SessionModel, now: number): Cursor | null {
  if (!cur || m.stage === "failed") return null;
  const items = anforanden(m);
  const index = items.findIndex((i) => anfKey(i) === cur.key);
  if (index === -1) return null;
  const next = (): Cursor | null => {
    const n = items[index + 1];
    return n ? { key: anfKey(n), words: 0 } : null;
  };
  if (cur.pauseUntil !== undefined) return now >= cur.pauseUntil ? next() : cur;

  const s = items[index]!.statement;
  if (cur.words < wordCount(s.text)) return { ...cur, words: cur.words + 1 };
  if (s.status === "done") return { ...cur, pauseUntil: now + PAUSE_MS };
  if (s.status === "failed") return { ...cur, pauseUntil: now + FAILED_PAUSE_MS };
  // A speech that is still on its way: wait for it, unless the debate has already moved past it.
  const debating = m.stage === "opening" || m.stage === "debating";
  return debating || s.status === "streaming" ? cur : next();
}

/** Moves straight to the next speaker (the "next speaker" button). */
export function skipSpeech(cur: Cursor | null, m: SessionModel): Cursor | null {
  if (!cur) return null;
  const items = anforanden(m);
  const n = items[items.findIndex((i) => anfKey(i) === cur.key) + 1];
  return n ? { key: anfKey(n), words: 0 } : null;
}

/**
 * The sitting as the viewer should see it at this point of playback: speeches before the cursor in full, the
 * current one up to the words revealed, later ones not yet given, and nothing of the stages that follow.
 */
export function present(m: SessionModel, cur: Cursor | null): SessionModel {
  if (!cur) return m;
  const items = anforanden(m);
  const index = items.findIndex((i) => anfKey(i) === cur.key);
  if (index === -1) return m;
  const statements: SessionModel["statements"] = {};
  items.forEach((it, i) => {
    const real = it.statement;
    let shown: StatementState;
    if (i < index) shown = real;
    else if (i > index) shown = { text: "", status: "pending", phase: real.status === "pending" ? real.phase : undefined };
    else if (real.status === "failed") shown = real;
    else if (!real.text) shown = { text: "", status: "pending", phase: real.phase };
    else {
      const complete = cur.words >= wordCount(real.text) && real.status === "done";
      shown = complete ? real : { text: firstWords(real.text, cur.words), status: "streaming" };
    }
    (statements[it.round] ??= {})[it.seat.id] = shown;
  });
  const round = items[index]!.round;
  return {
    ...m,
    statements,
    round,
    stage: round === 0 ? "opening" : "debating",
    saved: false,
    effectiveMode: m.mode,
    rankings: [],
    failedReviewers: [],
    tally: null,
    labels: [],
    verdict: "",
    votes: {},
    finalTally: null,
    winnerSeatId: null,
    error: null,
    spotlight: cur.key,
  };
}
