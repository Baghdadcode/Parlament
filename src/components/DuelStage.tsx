"use client";

import { speakingTimeForWords, wordCount } from "../core/riksdag";
import { Avatar } from "./PartyChip";
import { anforanden, isLive, type SessionModel } from "./model";

/** A 1-mot-1 debate face to face: the two debaters either side of the Speaker, with the winner marked at the end. */
export function DuelStage({ model, speakingId, onSelect }: { model: SessionModel; speakingId: string | null; onSelect: (id: string) => void }) {
  const items = anforanden(model);
  const live = isLive(model);
  const [left, right] = model.seats;
  if (!left || !right) return null;
  const winner = model.winnerSeatId;
  const judging = model.stage === "judging";

  const side = (seat: typeof left) => {
    const own = items.filter((i) => i.seat.id === seat.id && i.statement.text);
    const words = own.reduce((n, i) => n + wordCount(i.statement.text), 0);
    const speaking = live && speakingId === seat.id && items.some((i) => i.seat.id === seat.id && i.statement.status === "streaming");
    const won = winner === seat.id;
    const lost = winner !== null && !won;
    return (
      <button
        onClick={() => onSelect(seat.id)}
        aria-label={`${seat.name} (${seat.short})`}
        className={`flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg p-3 text-center transition ${
          won ? "bg-riks-gold-soft/40 ring-2 ring-riks-gold dark:bg-riks-gold/10" : "hover:bg-white/70 dark:hover:bg-zinc-800/60"
        } ${lost ? "opacity-60" : ""}`}
      >
        <span className="relative">
          <span className={`block rounded-full ${speaking ? "animate-pulse ring-4" : ""}`} style={{ ["--tw-ring-color" as string]: `${seat.color}66` }}>
            <Avatar member={seat} size={72} />
          </span>
          {won && (
            <span aria-hidden className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl">
              👑
            </span>
          )}
        </span>
        <span className="font-serif text-base font-semibold leading-tight">
          {seat.name} <span className="text-zinc-500">({seat.short})</span>
        </span>
        <span className="text-xs text-zinc-500">{seat.party}</span>
        <span className="text-[11px] tabular-nums text-zinc-500">
          {own.length} inlägg · ◷ {speakingTimeForWords(words)}
        </span>
        {speaking && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" /> TALAR
          </span>
        )}
        {won && <span className="rounded bg-riks-navy px-2 py-0.5 text-xs font-semibold tracking-wide text-white">VINNARE</span>}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label="Debatt 1 mot 1"
      className="rounded-xl border border-zinc-200 bg-gradient-to-b from-riks-paper to-white p-3 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950"
    >
      <div className="flex items-stretch gap-2">
        {side(left)}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-1">
          <span className="font-serif text-2xl italic text-riks-gold">mot</span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-400">
            {judging ? "Talmannen överlägger…" : winner ? "Avgjort" : model.stage === "done" ? "Ej avgjort" : "Debatt pågår"}
          </span>
        </div>
        {side(right)}
      </div>
      <p className="mt-2 text-center text-[11px] text-zinc-500">
        {model.talman.name} leder debatten och avgör vem som vann. Klicka på en debattör för att läsa.
      </p>
    </div>
  );
}
