import { judgmentBody, shortDate } from "../core/riksdag";
import { Markdown } from "./Markdown";
import { Avatar, PartyBadge } from "./PartyChip";
import type { SessionModel } from "./model";

/** The Speaker's judgment of a 1-mot-1 debate: who won, and why. */
export function Avgorande({ model, question }: { model: SessionModel; question: string }) {
  const writing = model.stage === "judging";
  if (!model.verdict && !writing) return null;
  const winner = model.seats.find((s) => s.id === model.winnerSeatId) ?? null;
  const loser = winner ? model.seats.find((s) => s.id !== winner.id) : null;
  const body = judgmentBody(model.verdict);
  const ref = model.riksmote ? `${model.riksmote}:${model.number}` : "";
  const when = model.createdAt ? new Date(model.createdAt) : null;

  return (
    <article
      aria-labelledby="avgorande-heading"
      className="print-sheet relative overflow-hidden rounded-sm border border-riks-gold/40 bg-riks-paper px-6 py-6 font-serif shadow-md sm:px-10 dark:bg-zinc-900"
    >
      <div className="watermark" aria-hidden>
        SIMULERING
      </div>
      <header className="relative flex flex-wrap items-start justify-between gap-3 border-b-2 border-riks-navy pb-3 dark:border-riks-gold/60">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.25em] text-riks-gold">TALMANNENS AVGÖRANDE</p>
          {ref && <p className="font-sans text-xs text-zinc-500">{ref}</p>}
        </div>
        <span className="-rotate-3 rounded border-2 border-zinc-400 px-2 py-0.5 font-sans text-xs font-bold tracking-widest text-zinc-500">SIMULERING</span>
      </header>

      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        {winner ? (
          <>
            <Avatar member={winner} size={48} />
            <div>
              <h2 id="avgorande-heading" className="text-2xl font-semibold leading-tight">
                {winner.name} vann debatten
              </h2>
              <p className="flex items-center gap-1.5 font-sans text-xs text-zinc-500">
                <PartyBadge member={winner} /> {winner.party}
                {loser && <span>· mot {loser.name} ({loser.short})</span>}
              </p>
            </div>
          </>
        ) : (
          <h2 id="avgorande-heading" className="text-2xl font-semibold leading-tight">
            {writing ? "Talmannen överlägger…" : "Talmannen utsåg ingen vinnare"}
          </h2>
        )}
      </div>
      <p className="relative mt-1 font-sans text-xs text-zinc-500">Med anledning av frågan: {question}</p>

      <div className="relative mt-4">
        {body ? (
          <Markdown text={body} className={`font-serif text-[15px] ${writing ? "caret" : ""}`} />
        ) : (
          <p className="text-sm text-zinc-400">…</p>
        )}
      </div>

      <footer className="relative mt-6 border-t border-zinc-300 pt-3 text-right text-sm italic dark:border-zinc-700">
        Stockholm {when ? shortDate(when) : ""} · {model.talman.name}
      </footer>
    </article>
  );
}
