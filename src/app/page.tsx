import Link from "next/link";
import { AskForm } from "../components/AskForm";
import { Hemicycle } from "../components/Hemicycle";
import { Outcome } from "../components/Outcome";
import { PartyBadge } from "../components/PartyChip";
import { dateTime, usd } from "../components/format";
import { DEBATE_ROUNDS } from "../config/models";
import { toMemberView } from "../core/view";
import { modelChoices } from "../core/models";
import { listBriefs, listSessions } from "../db/queries";
import { getDb, getKeyStatus, getMembers } from "../server/runtime";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const [briefs, status, recent] = await Promise.all([listBriefs(db), getKeyStatus(), listSessions(db, 5)]);
  const loaded = getMembers();
  const members = loaded.ok ? loaded.members.map(toMemberView) : [];
  const seats = members.reduce((n, m) => n + m.seats, 0);
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AskForm
          members={members}
          rounds={DEBATE_ROUNDS}
          briefs={briefs}
          canRunAtAll={status.ok && loaded.ok}
          models={modelChoices(status, loaded.ok ? [loaded.talman, ...loaded.members].map((m) => m.model) : [])}
        />
        {members.length > 0 && (
          <aside className="rounded-xl border border-zinc-200 bg-gradient-to-b from-riks-paper to-white p-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
            <h2 className="font-serif text-base font-semibold">Kammaren</h2>
            <p className="text-xs text-zinc-500">
              {members.length} partier{seats > 0 ? ` · ${seats} mandat` : ""} · {loaded.ok ? loaded.talman.name : ""} leder sammanträdet
            </p>
            <Hemicycle seats={members} className="mt-2" />
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {[...members]
                .sort((a, b) => a.placement - b.placement)
                .map((m) => (
                  <li key={m.id} className="flex items-center gap-1.5">
                    <PartyBadge member={m} />
                    <span className="truncate">{m.name}</span>
                    {m.seats > 0 && <span className="ml-auto text-zinc-400 tabular-nums">{m.seats}</span>}
                  </li>
                ))}
            </ul>
          </aside>
        )}
      </div>
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 font-serif text-base font-semibold">Senaste sammanträdena</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  {s.riksmote && <span className="w-20 shrink-0 font-serif text-xs text-zinc-500">{`${s.riksmote}:${s.number}`}</span>}
                  <span className="flex-1 truncate">{s.question}</span>
                  <Outcome tally={s.finalTally} />
                  {s.winner && <PartyBadge member={s.winner} />}
                  <span className="text-xs text-zinc-500">{dateTime(s.createdAt)}</span>
                  <span className="w-16 text-right text-xs text-zinc-500">{usd(s.totalCostUsd)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
