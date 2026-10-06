"use client";

import { tallyVotes } from "../core/riksdag";
import { VOTE_COLORS } from "./Hemicycle";
import { PartyBadge } from "./PartyChip";
import type { SessionModel, VoteState } from "./model";

const LABEL = { ja: "JA", nej: "NEJ", avstar: "AVSTÅR", franvarande: "FRÅNVARANDE" } as const;

/** The chamber's voting board for the main vote: lights per party, the running count, and the gavel. */
export function Voteringstavla({ model }: { model: SessionModel }) {
  const started = model.stage === "voting" || Object.keys(model.votes).length > 0;
  if (!started) return null;
  const parties = [...model.seats].sort((a, b) => a.placement - b.placement);
  const counted = model.finalTally ?? tallyVotes(Object.values(model.votes));
  const done = model.finalTally !== null;
  const maxSeats = Math.max(1, ...parties.map((p) => model.votes[p.id]?.weight ?? p.seats));

  return (
    <section aria-labelledby="board-heading" className="overflow-hidden rounded-xl border border-black/40 bg-riks-board text-zinc-100 shadow-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-3">
        <h2 id="board-heading" className="font-serif text-lg tracking-wide">
          Votering <span className="text-sm text-zinc-400">· Huvudvotering om talmannens förslag</span>
        </h2>
        <span className="text-xs uppercase tracking-widest text-zinc-400">{done ? "Voteringen är avslutad" : "Voteringen pågår…"}</span>
      </div>

      <ul className="grid gap-x-8 gap-y-2 px-5 py-4 sm:grid-cols-2">
        {parties.map((p) => {
          const v: VoteState | undefined = model.votes[p.id];
          const weight = v?.weight ?? p.seats;
          const lights = Math.max(1, Math.round((weight / maxSeats) * 24));
          return (
            <li key={p.id} title={v?.explanation || undefined}>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-9 shrink-0">
                  <PartyBadge member={p} className="ring-1 ring-white/30" />
                </span>
                <span className="flex flex-1 flex-wrap gap-[3px]" aria-hidden>
                  {Array.from({ length: lights }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${v ? "" : "animate-pulse"}`}
                      style={{
                        backgroundColor: v ? VOTE_COLORS[v.choice] : "#334155",
                        boxShadow: v && v.choice !== "franvarande" ? `0 0 6px ${VOTE_COLORS[v.choice]}` : undefined,
                        animationDelay: `${i * 40}ms`,
                      }}
                    />
                  ))}
                </span>
                <span className="w-28 shrink-0 text-right font-mono text-xs">
                  {v ? (
                    <>
                      <span style={{ color: VOTE_COLORS[v.choice] }}>{LABEL[v.choice]}</span> <span className="text-zinc-400">{weight}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">röstar…</span>
                  )}
                </span>
              </div>
              {v?.explanation && v.choice !== "franvarande" && <p className="ml-11 mt-0.5 text-[11px] italic leading-snug text-zinc-400">”{v.explanation}”</p>}
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-4">
        {(["ja", "nej", "avstar", "franvarande"] as const).map((k) => (
          <div key={k} className="bg-riks-board px-4 py-3 text-center">
            <p className="font-mono text-3xl tabular-nums" style={{ color: VOTE_COLORS[k], textShadow: `0 0 10px ${VOTE_COLORS[k]}55` }}>
              {counted[k]}
            </p>
            <p className="text-[11px] tracking-widest text-zinc-400">{LABEL[k]}</p>
          </div>
        ))}
      </div>

      {done && (
        <p className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/30 px-5 py-3 text-center font-serif text-base tracking-wide">
          <span className="gavel text-2xl" aria-hidden>
            🔨
          </span>
          {counted.passed === null
            ? "Voteringen kunde inte genomföras."
            : counted.passed
              ? "Kammaren har bifallit förslaget."
              : "Kammaren har avslagit förslaget."}
        </p>
      )}
    </section>
  );
}
