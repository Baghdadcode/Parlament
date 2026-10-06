import { annotateLabels, beslutPoints, parseDecision, shortDate } from "../core/riksdag";
import { Markdown } from "./Markdown";
import { PartyBadge } from "./PartyChip";
import type { SessionModel } from "./model";

/** The Speaker's text as a formal decision document: numbered points, reservations by party, the vote. */
export function Riksdagsbeslut({ model, question }: { model: SessionModel; question: string }) {
  if (!model.verdict && model.stage !== "synthesizing") return null;
  const writing = model.stage === "synthesizing";
  const letterToSeat = new Map(model.labels.map((l) => [l.label, model.seats.find((s) => s.id === l.seatId)!]));
  const annotate = (t: string) =>
    annotateLabels(
      t,
      model.labels.map((l) => ({ label: l.label, short: letterToSeat.get(l.label)?.short ?? "?" })),
    );
  const d = parseDecision(model.verdict);
  const t = model.finalTally;
  const status = t === null ? "proposal" : t.passed ? "passed" : t.passed === false ? "rejected" : "proposal";
  const kind = status === "passed" ? "RIKSDAGSBESLUT" : status === "rejected" ? "AVSLAGET FÖRSLAG TILL RIKSDAGSBESLUT" : "FÖRSLAG TILL RIKSDAGSBESLUT";
  const ref = model.riksmote ? `${model.riksmote}:${model.number}` : "";
  const when = model.createdAt ? new Date(model.createdAt) : null;

  return (
    <article
      aria-labelledby="beslut-heading"
      className="print-sheet relative overflow-hidden rounded-sm border border-riks-gold/40 bg-riks-paper px-6 py-6 font-serif shadow-md sm:px-10 dark:bg-zinc-900"
    >
      <div className="watermark" aria-hidden>
        SIMULERING
      </div>
      <header className="relative flex flex-wrap items-start justify-between gap-3 border-b-2 border-riks-navy pb-3 dark:border-riks-gold/60">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.25em] text-riks-gold">{kind}</p>
          {ref && <p className="font-sans text-xs text-zinc-500">{ref}</p>}
        </div>
        <span
          className={`-rotate-3 rounded border-2 px-2 py-0.5 font-sans text-xs font-bold tracking-widest ${
            status === "passed"
              ? "border-emerald-700 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400"
              : status === "rejected"
                ? "border-red-700 text-red-700 dark:border-red-400 dark:text-red-400"
                : "border-zinc-400 text-zinc-500"
          }`}
        >
          {status === "passed" ? "BIFALLET" : status === "rejected" ? "AVSLAGET" : "SIMULERING"}
        </span>
      </header>

      <h2 id="beslut-heading" className="relative mt-4 text-2xl font-semibold leading-tight">
        {d.title ?? (writing ? "Talmannen formulerar förslaget…" : "Riksdagens beslut")}
      </h2>
      <p className="relative mt-1 font-sans text-xs text-zinc-500">Med anledning av frågan: {question}</p>

      {d.preamble && d.title !== null && (
        <p className="relative mt-3 rounded bg-riks-gold-soft/40 px-3 py-2 font-sans text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {annotate(d.preamble)}
        </p>
      )}

      <section className="relative mt-5">
        <p className="text-lg italic">Riksdagen beslutar att</p>
        {d.beslut ? (
          <Markdown text={annotate(beslutPoints(d.beslut))} className={`mt-1 font-serif text-[15px] ${writing && !d.motivering ? "caret" : ""}`} />
        ) : (
          <p className="mt-1 text-sm text-zinc-400">…</p>
        )}
      </section>

      {(d.motivering || d.risker || d.other) && (
        <div className="relative mt-5 grid gap-5 md:grid-cols-2">
          {d.motivering && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Motivering</h3>
              <Markdown text={annotate(d.motivering)} className="mt-1 font-serif" />
            </section>
          )}
          {d.risker && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Risker och uppföljning</h3>
              <Markdown text={annotate(d.risker)} className="mt-1 font-serif" />
            </section>
          )}
          {d.other && <Markdown text={annotate(d.other)} className="font-serif md:col-span-2" />}
        </div>
      )}

      {d.reservations.length > 0 && (
        <section className="relative mt-6 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Reservationer</h3>
          {d.reservations.map((r) => {
            const parties = r.letters.map((l) => letterToSeat.get(l)).filter((s) => s !== undefined);
            return (
              <div key={r.number} className="border-l-4 border-riks-gold/70 bg-white/60 py-2 pl-4 pr-3 dark:bg-zinc-950/40">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  Reservation {r.number}
                  {parties.length > 0 && (
                    <span className="font-normal text-zinc-500">({parties.map((p) => p.short).join(", ")})</span>
                  )}
                  {r.title && <span>– {r.title}</span>}
                  <span className="ml-1 flex gap-1">
                    {parties.map((p) => (
                      <PartyBadge key={p.id} member={p} />
                    ))}
                  </span>
                </p>
                {r.text && <Markdown text={annotate(r.text)} className="mt-1 font-serif" />}
              </div>
            );
          })}
        </section>
      )}

      <footer className="relative mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-300 pt-3 text-sm dark:border-zinc-700">
        <p className="font-sans text-xs text-zinc-600 dark:text-zinc-400">
          {t ? (
            <>
              Votering: Ja {t.ja} · Nej {t.nej} · Avstår {t.avstar} · Frånvarande {t.franvarande}
            </>
          ) : model.stage === "voting" ? (
            "Huvudvotering pågår…"
          ) : (
            "Förslaget har inte gått till votering."
          )}
        </p>
        <p className="italic">
          Stockholm {when ? shortDate(when) : ""} · {model.talman.name}
        </p>
      </footer>
      {model.rankings.length > 0 && (
        <details className="no-print relative mt-3 font-sans text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">Vem är &quot;Ledamot 2&quot;?</summary>
          <p className="mt-1">Talmannen läste rangordningarna anonymt. Förslagens partier står i parentes i texten ovan.</p>
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {model.rankings.map((r) => {
              const s = model.seats.find((x) => x.id === r.reviewerSeatId);
              return (
                <li key={r.reviewerLabel}>
                  {r.reviewerLabel} = {s?.name} ({s?.short})
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
