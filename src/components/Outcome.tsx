import type { FinalVoteTally } from "../core/riksdag";

/** "Bifall 235–92" / "Avslag 120–200" for a sitting's main vote. */
export function Outcome({ tally }: { tally: FinalVoteTally | null }) {
  if (!tally || tally.passed === null) return <span className="text-xs text-zinc-400">–</span>;
  return (
    <span className={`whitespace-nowrap text-xs font-medium ${tally.passed ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
      {tally.passed ? "Bifall" : "Avslag"} {tally.ja}–{tally.nej}
    </span>
  );
}
