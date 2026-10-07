import { describe, expect, it } from "vitest";
import { loadMembers } from "../src/members/load";
import { toMemberView } from "../src/core/view";
import { initialModel, reduce, type SessionModel } from "../src/components/model";
import { firstWords, PAUSE_MS, present, skipSpeech, startCursor, tick, type Cursor } from "../src/components/playback";
import type { StreamEvent } from "../src/server/runtime";

const { members, talman } = loadMembers("members");
const [a, b] = [members.find((m) => m.id === "m")!, members.find((m) => m.id === "s")!];

function duel(events: StreamEvent[]): SessionModel {
  const m = initialModel({
    format: "duell",
    seats: [a, b].map(toMemberView),
    talman: toMemberView(talman),
    mode: "chairman",
    rounds: 1,
    riksmote: "2026/27",
    number: 1,
    createdAt: null,
  });
  return events.reduce(reduce, m);
}
const said = (seatId: string, round: number, text: string): StreamEvent[] => [
  { type: "statement_delta", seatId, round, text },
  { type: "statement_done", seatId, round },
];

/** Runs the clock until the cursor stops changing or `ms` have passed. */
function run(cur: Cursor | null, m: SessionModel, from: number, ms: number, step = 100) {
  let t = from;
  while (cur && t < from + ms) {
    cur = tick(cur, m, t);
    t += step;
  }
  return { cur, t };
}

describe("playback", () => {
  it("cuts a text after n words, keeping its spacing", () => {
    expect(firstWords("Herr talman!  Jag\nföreslår mer.", 3)).toBe("Herr talman!  Jag");
    expect(firstWords("ett två", 9)).toBe("ett två");
    expect(firstWords("ett två", 0)).toBe("");
  });

  it("reveals the first speech word by word even though both arrived at once, and hides the rest", () => {
    const m = duel([...said("m", 0, "Herr talman! Bygg kärnkraft nu."), ...said("s", 0, "Herr talman! Nej.")]);
    let cur = startCursor(m);
    expect(cur).toEqual({ key: "0:m", words: 0 });
    cur = tick(tick(cur, m, 0), m, 0);
    const shown = present(m, cur);
    expect(shown.statements[0]!.m).toEqual({ text: "Herr talman!", status: "streaming" });
    expect(shown.statements[0]!.s).toMatchObject({ text: "", status: "pending" });
    expect(shown.spotlight).toBe("0:m");
    expect(shown.stage).toBe("opening");
  });

  it("holds a finished speech for the pause, then moves to the next speaker", () => {
    const m = duel([...said("m", 0, "Ett två tre."), ...said("s", 0, "Fyra fem.")]);
    let cur: Cursor | null = { key: "0:m", words: 3 };
    cur = tick(cur, m, 1000);
    expect(cur).toEqual({ key: "0:m", words: 3, pauseUntil: 1000 + PAUSE_MS });
    expect(present(m, cur).statements[0]!.m!.status).toBe("done");
    expect(tick(cur, m, 1000 + PAUSE_MS - 1)).toBe(cur);
    expect(tick(cur, m, 1000 + PAUSE_MS)).toEqual({ key: "0:s", words: 0 });
  });

  it("waits for a speech that has not arrived yet", () => {
    const m = duel([...said("m", 0, "Ett."), { type: "statement_delta", seatId: "s", round: 0, text: "Fyra" }]);
    const cur: Cursor = { key: "0:s", words: 1 };
    expect(tick(cur, m, 0)).toBe(cur);
    expect(present(m, cur).statements[0]!.s).toEqual({ text: "Fyra", status: "streaming" });
  });

  it("keeps the vote, verdict and winner back until every speech has been shown, then ends", () => {
    const m = duel([
      ...said("m", 0, "A."),
      ...said("s", 0, "B."),
      ...said("m", 1, "C."),
      ...said("s", 1, "D."),
      { type: "state", state: "judging" },
      { type: "verdict_delta", text: "Vinnare: Ulf Kristersson" },
      { type: "duel_result", winnerSeatId: "m" },
      { type: "state", state: "done" },
      { type: "saved", sessionId: "x" },
    ]);
    const cur = startCursor(m);
    const mid = present(m, cur);
    expect(mid).toMatchObject({ verdict: "", winnerSeatId: null, saved: false, stage: "opening" });
    const { cur: end } = run(cur, m, 0, 60_000);
    expect(end).toBeNull();
    expect(present(m, end)).toBe(m);
  });

  it("skips to the next speaker on request, and stops for a failed sitting", () => {
    const m = duel([...said("m", 0, "Ett två tre.")]);
    expect(skipSpeech({ key: "0:m", words: 1 }, m)).toEqual({ key: "0:s", words: 0 });
    expect(skipSpeech({ key: "1:s", words: 0 }, m)).toBeNull();
    expect(tick({ key: "0:m", words: 0 }, reduce(m, { type: "error", message: "x" }), 0)).toBeNull();
  });
});
