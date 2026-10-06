import Link from "next/link";
import { listSessions } from "../../db/queries";
import { getDb } from "../../server/runtime";
import { PartyBadge } from "../../components/PartyChip";
import { dateTime, usd } from "../../components/format";

export const dynamic = "force-dynamic";

export default async function History() {
  const sessions = await listSessions(await getDb(), 500);
  const total = sessions.reduce((n, s) => n + s.totalCostUsd, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Historik</h1>
        <p className="text-sm text-zinc-500">
          {sessions.length} debatter · {usd(total)} totalt
        </p>
      </div>
      {sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Inga debatter ännu.{" "}
          <Link href="/" className="text-indigo-600 hover:underline">
            Ställ en fråga till riksdagen.
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">Fråga</th>
                <th className="px-2 py-2 font-medium">När</th>
                <th className="px-2 py-2 font-medium">Beslut</th>
                <th className="px-2 py-2 font-medium">Vinnande förslag</th>
                <th className="px-4 py-2 text-right font-medium">Kostnad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {sessions.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="max-w-md px-4 py-2">
                    <Link href={`/sessions/${s.id}`} className="line-clamp-2 hover:underline">
                      {s.question}
                    </Link>
                    {s.state !== "done" && <span className="text-xs text-red-600">misslyckades</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs text-zinc-500">{dateTime(s.createdAt)}</td>
                  <td className="px-2 py-2 text-xs">{s.mode === "full" ? "Votering" : "Talmannen"}</td>
                  <td className="px-2 py-2 text-xs">
                    {s.winner ? (
                      <span className="inline-flex items-center gap-1.5">
                        <PartyBadge member={s.winner} /> {s.winner.name}
                      </span>
                    ) : (
                      "–"
                    )}
                    {s.closeRace && (
                      <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">jämnt</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-xs">{usd(s.totalCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
