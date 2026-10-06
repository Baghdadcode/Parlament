import Link from "next/link";
import { AskForm } from "../components/AskForm";
import { PartyBadge } from "../components/PartyChip";
import { dateTime, usd } from "../components/format";
import { DEBATE_ROUNDS } from "../config/models";
import { toMemberView } from "../core/view";
import { listBriefs, listSessions } from "../db/queries";
import { getDb, getKeyStatus, getMembers } from "../server/runtime";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const [briefs, status, recent] = await Promise.all([listBriefs(db), getKeyStatus(), listSessions(db, 5)]);
  const members = getMembers();
  return (
    <div className="space-y-8">
      <AskForm
        members={members.ok ? members.members.map(toMemberView) : []}
        rounds={DEBATE_ROUNDS}
        briefs={briefs}
        canRunAtAll={status.ok && members.ok}
      />
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Senaste debatterna</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <span className="flex-1 truncate">{s.question}</span>
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
