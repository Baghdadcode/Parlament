"use client";

import { judgmentBody, mentions, sittingDate, sittingTime } from "../core/riksdag";
import { Markdown } from "./Markdown";
import { anforanden, type SessionModel } from "./model";
import { Riksdagsbeslut } from "./Riksdagsbeslut";

const CHOICE = { ja: "Ja", nej: "Nej", avstar: "Avstår", franvarande: "Frånvarande" } as const;

/** The whole sitting as the record of proceedings (snabbprotokoll), ready to print or save as PDF. */
export function Protokoll({ model, question, briefName }: { model: SessionModel; question: string; briefName: string | null }) {
  const when = model.createdAt ? new Date(model.createdAt) : null;
  const items = anforanden(model).filter((i) => i.statement.status !== "pending");
  const byId = new Map(model.seats.map((s) => [s.id, s]));
  const labelOf = new Map(model.labels.map((l) => [l.seatId, l.label]));
  const parties = [...model.seats].sort((a, b) => a.placement - b.placement);
  const duel = model.format === "duell";
  const winner = model.seats.find((s) => s.id === model.winnerSeatId);
  let paragraph = 0;
  const p = () => `§ ${++paragraph}`;

  return (
    <div className="space-y-3">
      <div className="no-print flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Skriv ut / spara som PDF
        </button>
      </div>
      <article className="print-sheet relative mx-auto max-w-3xl overflow-hidden bg-white px-6 py-10 font-serif shadow-md sm:px-14 dark:bg-zinc-900">
        <div className="watermark" aria-hidden>
          SIMULERING
        </div>
        <header className="relative text-center">
          <p className="text-xs tracking-[0.35em] text-zinc-500">SIMULERING</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-wide">Riksdagens protokoll{model.riksmote ? ` ${model.riksmote}:${model.number}` : ""}</h2>
          {when && (
            <p className="mt-1 italic text-zinc-600 dark:text-zinc-400">
              {sittingDate(when)}, {sittingTime(when)}
            </p>
          )}
          <div className="mx-auto mt-4 h-px w-24 bg-riks-gold" />
        </header>

        <section className="relative mt-8 space-y-1">
          <h3 className="font-semibold">{p()} {duel ? "Debatt 1 mot 1" : "Partiledardebatt"}</h3>
          <p>
            {duel
              ? `Talmannen meddelade att en debatt mellan ${model.seats.map((s) => `${s.name} (${s.short})`).join(" och ")} skulle hållas med anledning av följande fråga:`
              : "Talmannen meddelade att partiledardebatt skulle hållas med anledning av följande fråga:"}
          </p>
          <blockquote className="border-l-2 border-riks-gold pl-4 italic">{question}</blockquote>
          {briefName && <p className="text-sm text-zinc-600 dark:text-zinc-400">Underlag: {briefName}.</p>}
        </section>

        <section className="relative mt-6 space-y-6">
          {items.map((it) => {
            const answered = it.round > 0 ? mentions(it.statement.text, model.seats, it.seat.id) : [];
            return (
              <div key={`${it.round}:${it.seat.id}`} className="break-inside-avoid-page">
                <p className="text-sm">
                  <span className="font-sans text-xs text-zinc-500">{it.anf ? `Anf. ${it.anf}` : "Anf. –"}</span>{" "}
                  <span className="font-semibold uppercase tracking-wide">{it.seat.name}</span> ({it.seat.short})
                  {it.round > 0 && <span className="italic"> replik{answered.length > 0 ? ` till ${answered.map((id) => byId.get(id)?.short).join(", ")}` : ""}</span>}:
                </p>
                {it.statement.status === "failed" ? (
                  <p className="mt-1 text-sm italic text-zinc-500">[Anförandet uteblev.]</p>
                ) : (
                  <Markdown text={it.statement.text} variant="protocol" className="mt-1 font-serif text-[15px]" />
                )}
              </div>
            );
          })}
          {items.length > 0 && <p className="text-sm italic">Överläggningen var härmed avslutad.</p>}
        </section>

        {model.tally && (
          <section className="relative mt-8 break-inside-avoid-page">
            <h3 className="font-semibold">{p()} Förberedande votering</h3>
            <p className="mt-1 text-sm">
              Partiledarna rangordnade varandras slutförslag utan att veta vem som lagt fram vilket. Poäng enligt Borda-metoden:
            </p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {model.tally.entries.map((e, i) => {
                  const s = byId.get(e.seatId);
                  return (
                    <tr key={e.seatId} className="border-b border-zinc-200 dark:border-zinc-800">
                      <td className="w-8 py-1 pr-2 text-zinc-500">{i + 1}.</td>
                      <td className="py-1">
                        Förslag {labelOf.get(e.seatId)} ({s?.short})
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {e.points}/{e.maxPossible} poäng
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1 text-sm italic">
              {model.tally.tie ? "Lika röstetal; talmannen avgjorde vilket förslag som skulle ligga till grund." : `Förslag ${labelOf.get(model.tally.winnerSeatId ?? "")} låg därmed till grund för talmannens förslag.`}
            </p>
          </section>
        )}

        {duel && model.verdict && (
          <section className="relative mt-8 break-inside-avoid-page">
            <h3 className="font-semibold">{p()} Talmannens avgörande</h3>
            <p className="mt-1 font-semibold">
              {winner ? `Talmannen förklarade ${winner.name} (${winner.short}) som vinnare av debatten.` : "Talmannen utsåg ingen vinnare."}
            </p>
            <Markdown text={judgmentBody(model.verdict)} variant="protocol" className="mt-2 font-serif text-[15px]" />
          </section>
        )}

        {!duel && model.verdict && (
          <section className="relative mt-8">
            <h3 className="mb-3 font-semibold">{p()} Talmannens förslag till beslut</h3>
            <Riksdagsbeslut model={model} question={question} />
          </section>
        )}

        {model.finalTally && (
          <section className="relative mt-8 break-inside-avoid-page">
            <h3 className="font-semibold">{p()} Huvudvotering</h3>
            <p className="mt-1 text-sm">Kammaren röstade om talmannens förslag. Varje parti röstade med sina mandat.</p>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {parties.map((s) => {
                  const v = model.votes[s.id];
                  return (
                    <tr key={s.id} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                      <td className="w-16 py-1 font-semibold">{s.short}</td>
                      <td className="w-24 py-1">{v ? CHOICE[v.choice] : "–"}</td>
                      <td className="w-14 py-1 text-right tabular-nums">{v?.weight ?? s.seats}</td>
                      <td className="py-1 pl-4 text-xs italic text-zinc-600 dark:text-zinc-400">
                        {v?.explanation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              Ja {model.finalTally.ja}, nej {model.finalTally.nej}, avstår {model.finalTally.avstar}, frånvarande {model.finalTally.franvarande}.
            </p>
            <p className="mt-1 font-semibold">
              {model.finalTally.passed === null
                ? "Voteringen kunde inte genomföras."
                : model.finalTally.passed
                  ? "Kammaren biföll talmannens förslag."
                  : "Kammaren avslog talmannens förslag."}
            </p>
          </section>
        )}

        <footer className="relative mt-12 text-center text-sm italic text-zinc-600 dark:text-zinc-400">
          <p>Vid protokollet</p>
          <p className="mt-6 not-italic tracking-wide">{model.talman.name}</p>
          <p className="mt-6 font-sans text-[10px] not-italic text-zinc-400">
            Simulerad debatt. Partiledarna är AI-personor (Claude) byggda på partiernas offentliga hållning, inte de verkliga personernas uttalanden.
          </p>
        </footer>
      </article>
    </div>
  );
}
