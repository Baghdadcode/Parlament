"use client";

import { speakingTime } from "../core/riksdag";
import { phaseShort, roundLabel } from "./format";
import { Avatar } from "./PartyChip";
import type { Anforande } from "./model";

/** The speakers' list, as the Speaker reads it: numbered speeches per round, with status and speaking time. */
export function Talarlista({
  items,
  rounds,
  currentKey,
  onSelect,
  title = "Partiledardebatt",
}: {
  items: Anforande[];
  rounds: number;
  currentKey: string | null;
  onSelect: (key: string) => void;
  title?: string;
}) {
  return (
    <nav aria-label="Talarlista" className="rounded-lg border border-zinc-200 bg-riks-paper dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="border-b border-zinc-200 px-3 py-2 font-serif text-sm font-semibold tracking-wide dark:border-zinc-800">
        Talarlista <span className="font-sans text-xs font-normal text-zinc-500">· {title}</span>
      </h3>
      <div className="max-h-[34rem] overflow-y-auto px-1 pb-2">
        {Array.from({ length: rounds + 1 }, (_, round) => {
          const inRound = items.filter((i) => i.round === round);
          if (inRound.length === 0) return null;
          return (
            <div key={round}>
              <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{roundLabel(round)}</p>
              <ol>
                {inRound.map((it) => {
                  const key = anfKey(it);
                  const s = it.statement;
                  const selected = key === currentKey;
                  return (
                    <li key={key}>
                      <button
                        onClick={() => onSelect(key)}
                        disabled={s.status === "pending"}
                        aria-current={selected ? "true" : undefined}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs disabled:cursor-default ${
                          selected ? "bg-riks-navy text-white dark:bg-riks-navy-2" : "hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <span className={`w-5 shrink-0 text-right tabular-nums ${selected ? "text-riks-gold-soft" : "text-zinc-400"}`}>{it.anf ?? "–"}</span>
                        <Avatar member={it.seat} size={20} />
                        <span className="min-w-0 flex-1 truncate">
                          {it.seat.name} <span className={selected ? "text-zinc-300" : "text-zinc-500"}>({it.seat.short})</span>
                        </span>
                        <Status statement={s} selected={selected} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export const anfKey = (a: Pick<Anforande, "round" | "seat">) => `${a.round}:${a.seat.id}`;

function Status({ statement, selected }: { statement: Anforande["statement"]; selected: boolean }) {
  const { status, text, phase } = statement;
  if (status === "done") return <span className={`shrink-0 tabular-nums ${selected ? "text-zinc-200" : "text-zinc-500"}`}>✓ {speakingTime(text)}</span>;
  if (status === "streaming")
    return (
      <span className="flex shrink-0 items-center gap-1 font-medium text-red-600 dark:text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600" /> talar
      </span>
    );
  if (status === "failed") return <span className="shrink-0 text-red-600">uteblev</span>;
  if (!phase) return <span className="shrink-0 text-zinc-400">väntar</span>;
  const tone = phase.kind === "retrying" ? "text-amber-600 dark:text-amber-400" : phase.kind === "thinking" ? "text-sky-600 dark:text-sky-400" : "text-zinc-400";
  return (
    <span className={`shrink-0 ${phase.kind === "thinking" ? "animate-pulse" : ""} ${selected ? "text-zinc-200" : tone}`} title={phase.kind === "retrying" ? phase.reason : undefined}>
      {phaseShort(phase)}
    </span>
  );
}
