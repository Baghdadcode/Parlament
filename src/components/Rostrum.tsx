"use client";

import { mentions, speakingTime, speakingTimeForWords, wordCount } from "../core/riksdag";
import { OPENING_WORD_CAP, REBUTTAL_WORD_CAP } from "../members/prompts";
import { Markdown } from "./Markdown";
import { Avatar } from "./PartyChip";
import { roundLabel } from "./format";
import type { Anforande } from "./model";
import type { MemberView } from "../core/view";

/** The speech at the rostrum, with a webb-TV style name tag and the Speaker's introduction. */
export function Rostrum({ item, seats }: { item: Anforande | null; seats: MemberView[] }) {
  if (!item) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        Talmannen öppnar sammanträdet…
      </section>
    );
  }
  const { seat, statement: s, round, anf } = item;
  const answered = round > 0 && s.text ? mentions(s.text, seats, seat.id) : [];
  const byId = new Map(seats.map((m) => [m.id, m]));
  const cap = round === 0 ? OPENING_WORD_CAP : REBUTTAL_WORD_CAP;
  const progress = Math.min(1, wordCount(s.text) / cap);
  return (
    <section aria-label="Talarstolen" className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <p className="border-b border-zinc-100 bg-riks-paper px-4 py-1.5 font-serif text-xs italic text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Talmannen: {round === 0 ? "Ordet går till" : "Replik från"} {seat.name} ({seat.short}).
      </p>
      {/* Lower third, as on the chamber's broadcast. */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${seat.color}` }}>
        <Avatar member={seat} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base font-semibold leading-tight">
            {seat.name} <span className="text-zinc-500">({seat.short})</span>
          </p>
          <p className="text-xs text-zinc-500">
            {seat.title}, {seat.party}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-zinc-500">
          <p className="flex items-center justify-end gap-1.5">
            {s.status === "streaming" && (
              <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" /> TALAR
              </span>
            )}
            <span>
              {anf ? `Anf. ${anf}` : "Anf. –"} · {roundLabel(round)}
            </span>
          </p>
          <p className="tabular-nums">
            ◷ {speakingTime(s.text)} / {speakingTimeForWords(cap)}
          </p>
        </div>
      </div>
      <div className="h-0.5 bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full transition-all" style={{ width: `${progress * 100}%`, backgroundColor: seat.color }} />
      </div>
      {answered.length > 0 && (
        <p className="px-4 pt-2 text-[11px] text-zinc-500">
          Replik på: {answered.map((id) => `${byId.get(id)?.name} (${byId.get(id)?.short})`).join(", ")}
        </p>
      )}
      <div className="px-4 py-3">
        {s.status === "failed" ? (
          <p className="text-sm text-red-600 dark:text-red-400">Anförandet uteblev: {s.error}</p>
        ) : s.text ? (
          <Markdown text={s.text} className={`font-serif text-[15px] ${s.status === "streaming" ? "caret" : ""}`} />
        ) : (
          <p className="text-sm text-zinc-400">{seat.name} går upp i talarstolen…</p>
        )}
      </div>
    </section>
  );
}
