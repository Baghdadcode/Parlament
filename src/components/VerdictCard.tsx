import { splitVerdict } from "../core/view";
import { Markdown } from "./Markdown";
import { PartyBadge } from "./PartyChip";
import type { SessionModel } from "./model";

export function VerdictCard({ model }: { model: SessionModel }) {
  if (!model.verdict && model.stage !== "synthesizing") return null;
  const { main, minority } = splitVerdict(model.verdict);
  const streaming = model.stage === "synthesizing";
  const seat = new Map(model.seats.map((s) => [s.id, s]));
  return (
    <section aria-labelledby="verdict-heading" className="rounded-xl border-2 border-indigo-500/60 bg-white p-5 shadow-sm dark:bg-zinc-900">
      <h2 id="verdict-heading" className="mb-1 text-base font-semibold">
        Riksdagens beslut
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        {model.talman.name} ·{" "}
        {model.effectiveMode === "chairman"
          ? "Talmannen avgjorde utan votering."
          : "Bygger på det vinnande förslaget, med de starkaste delarna av de övriga."}
      </p>
      {main ? <Markdown text={main} className={streaming && !minority ? "caret" : ""} /> : <p className="text-sm text-zinc-400">Talmannen läser förslagen…</p>}
      {minority && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Reservationer</h3>
          <Markdown text={minority} className={streaming ? "caret" : ""} />
        </div>
      )}
      {(model.labels.length > 0 || model.rankings.length > 0) && (
        <details className="mt-4 text-xs text-zinc-500">
          <summary className="cursor-pointer select-none">Vem är &quot;Förslag C&quot; eller &quot;Ledamot 2&quot;?</summary>
          <p className="mt-2">Talmannen och ledamöterna läste förslagen anonymt. Så här hänger det ihop:</p>
          <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {[...model.labels]
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((l) => {
                const s = seat.get(l.seatId);
                return (
                  <li key={l.label} className="flex items-center gap-1.5">
                    Förslag {l.label} = {s && <PartyBadge member={s} />} {s?.name}
                  </li>
                );
              })}
            {model.rankings.map((r) => {
              const s = seat.get(r.reviewerSeatId);
              return (
                <li key={r.reviewerLabel} className="flex items-center gap-1.5">
                  {r.reviewerLabel} = {s && <PartyBadge member={s} />} {s?.name}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
