import { ordinal } from "./format";
import { PartyBadge } from "./PartyChip";
import { droppedIn, type SessionModel } from "./model";

/** Voters (rows) against final proposals (columns), with Borda totals, winner and close-race badge. */
export function VoteMatrix({ model }: { model: SessionModel }) {
  const { tally, rankings, seats } = model;
  if (model.stage !== "done" && model.stage !== "failed" && !["ranking", "counting", "synthesizing"].includes(model.stage)) return null;
  if (model.effectiveMode === "chairman") {
    if (!model.verdict) return null;
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        Ingen votering i den här sessionen: talmannen valde det bästa förslaget direkt{model.mode === "full" ? " (ingen rangordning kom tillbaka)" : ""}.
      </section>
    );
  }
  if (rankings.length === 0 && model.failedReviewers.length === 0) return null;
  const voters = new Map(seats.map((s) => [s.id, s]));
  const inVote = seats.filter((s) => droppedIn(model, s.id) === null);
  const entry = new Map(tally?.entries.map((e) => [e.seatId, e]) ?? []);

  return (
    <section aria-labelledby="matrix-heading" className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="matrix-heading" className="text-sm font-semibold">
          Votering
        </h2>
        {tally?.tie && <Badge tone="red">Lika röstetal: talmannen avgör</Badge>}
        {tally && !tally.tie && tally.closeRace && <Badge tone="amber">Jämnt löp</Badge>}
        {tally && <span className="text-xs text-zinc-500">Marginal {(tally.marginFraction * 100).toFixed(1)} % av maxpoäng</span>}
        {!tally && (
          <span className="text-xs text-zinc-500">
            {rankings.length} av {inVote.length} röster inne…
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="py-1.5 pr-2 font-medium text-zinc-500">Röstande ↓ / Förslag →</th>
              {inVote.map((s) => (
                <th key={s.id} className="px-2 py-1.5 font-medium" title={s.name}>
                  <PartyBadge member={s} className={tally?.winnerSeatId === s.id ? "ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-zinc-900" : ""} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => {
              const byAnswer = new Map(r.items.map((i) => [i.answerSeatId, i]));
              const n = r.items.length;
              const voter = voters.get(r.reviewerSeatId);
              return (
                <tr key={r.reviewerSeatId} className="border-t border-zinc-100 dark:border-zinc-800">
                  <th className="whitespace-nowrap py-1.5 pr-2 font-normal">
                    {voter?.name ?? r.reviewerSeatId} <span className="text-zinc-400">({r.reviewerLabel})</span>
                  </th>
                  {inVote.map((s) => {
                    const it = byAnswer.get(s.id);
                    if (s.id === r.reviewerSeatId)
                      return (
                        <td key={s.id} className="px-2 py-1.5 text-zinc-300 dark:text-zinc-600" title="Ingen röstar på sitt eget förslag">
                          —
                        </td>
                      );
                    if (!it) return <td key={s.id} className="px-2 py-1.5 text-zinc-300">·</td>;
                    return (
                      <td key={s.id} className="px-2 py-1.5" title={it.reasoning}>
                        <span className={it.rank === 1 ? "font-semibold" : ""}>{ordinal(it.rank)}</span>
                        <span className="ml-1 text-zinc-400">+{n - it.rank}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {model.failedReviewers.map((f) => (
              <tr key={f.seatId} className="border-t border-zinc-100 text-red-600 dark:border-zinc-800 dark:text-red-400">
                <th className="py-1.5 pr-2 font-normal">{voters.get(f.seatId)?.name}</th>
                <td colSpan={inVote.length} className="px-2 py-1.5">
                  Rösten misslyckades: {f.error}
                </td>
              </tr>
            ))}
          </tbody>
          {tally && (
            <tfoot>
              <tr className="border-t-2 border-zinc-300 dark:border-zinc-700">
                <th className="py-1.5 pr-2 font-semibold">Borda totalt</th>
                {inVote.map((s) => {
                  const e = entry.get(s.id);
                  const win = tally.winnerSeatId === s.id;
                  return (
                    <td key={s.id} className={`whitespace-nowrap px-2 py-1.5 font-semibold ${win ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                      {e ? `${e.points}/${e.maxPossible}` : "–"}
                      {win && <span className="ml-1 rounded bg-indigo-600 px-1 py-0.5 text-[10px] font-medium text-white">Vinnare</span>}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        Håll muspekaren över en ruta för den röstandes motivering. Med N förslag ger 1:a plats N−1 poäng och sista plats 0. Förslagen var anonyma när
        ledamöterna röstade.
      </p>
    </section>
  );
}

function Badge({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const cls = tone === "amber" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
