"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { PartyBadge } from "./PartyChip";
import { roundLabel } from "./format";
import { droppedIn, type SessionModel } from "./model";

/** The debate round by round: a tab per round, a party-coloured card per member. Follows the live round. */
export function DebateRounds({ model }: { model: SessionModel }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const live = !model.saved && model.stage !== "failed";
  const shown = picked ?? model.round;
  const rounds = Array.from({ length: model.rounds + 1 }, (_, i) => i);
  const labelOf = new Map(model.labels.map((l) => [l.seatId, l.label]));
  const winner = model.tally?.winnerSeatId;
  const isFinal = shown === model.rounds;
  const roundDone = shown < model.round || (shown === model.round && model.stage !== "opening" && model.stage !== "debating");

  return (
    <section aria-labelledby="debate-heading">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="debate-heading" className="mr-2 text-sm font-semibold">
          Debatten
        </h2>
        <div role="tablist" aria-label="Rundor" className="flex flex-wrap gap-1">
          {rounds.map((r) => {
            const reached = r <= model.round;
            return (
              <button
                key={r}
                role="tab"
                aria-selected={shown === r}
                disabled={!reached}
                onClick={() => setPicked(r === model.round && live ? null : r)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  shown === r
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {roundLabel(r)}
              </button>
            );
          })}
        </div>
        {roundDone && (
          <button className="ml-auto text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setExpanded((x) => !x)}>
            {expanded ? "Fäll ihop" : "Visa allt"}
          </button>
        )}
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
        {model.seats.map((seat) => {
          const dropped = droppedIn(model, seat.id);
          if (dropped !== null && dropped < shown) return null;
          const s = model.statements[shown]?.[seat.id] ?? { text: "", status: "pending" as const };
          const label = isFinal ? labelOf.get(seat.id) : undefined;
          return (
            <article
              key={seat.id}
              aria-label={seat.name}
              className={`flex flex-col rounded-lg border border-l-4 border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${winner === seat.id && isFinal ? "ring-2 ring-indigo-500" : ""}`}
              style={{ borderLeftColor: seat.color }}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <PartyBadge member={seat} />
                  {seat.name}
                </h3>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-zinc-500">
                  {label && <span title="Etiketten talmannen såg">Förslag {label}</span>}
                  {winner === seat.id && isFinal && <span className="rounded bg-indigo-600 px-1.5 py-0.5 font-medium text-white">Vinnare</span>}
                  <StatusDot status={s.status} />
                </span>
              </header>
              {s.status === "failed" ? (
                <p className="text-sm text-red-600 dark:text-red-400">Misslyckades: {s.error}</p>
              ) : s.text ? (
                <Clamp clamped={roundDone && !expanded}>
                  <Markdown text={s.text} className={s.status === "streaming" ? "caret" : ""} />
                </Clamp>
              ) : (
                <p className="text-sm text-zinc-400">Förbereder sitt anförande…</p>
              )}
              <footer className="mt-auto pt-2 text-[11px] text-zinc-400">
                {seat.party} · {seat.model.replace("claude-", "")} · {seat.effort}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<string, string> = { done: "klar", failed: "misslyckades", streaming: "talar", pending: "väntar" };

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "done" ? "bg-emerald-500" : status === "failed" ? "bg-red-500" : status === "streaming" ? "bg-indigo-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-600";
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} aria-label={STATUS_TEXT[status]} title={STATUS_TEXT[status]} />;
}

/** Caps a finished statement's height, fading the bottom only when the text actually overflows. */
function Clamp({ clamped, children }: { clamped: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [clamped, children]);
  return (
    <div ref={ref} className={`relative ${clamped ? "max-h-72 overflow-hidden" : ""}`}>
      {children}
      {clamped && overflows && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white dark:from-zinc-900" />}
    </div>
  );
}
