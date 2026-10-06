import type { MemberView } from "../core/view";

/** Party abbreviation on the party colour, e.g. a red "S". */
export function PartyBadge({ member, className = "" }: { member: Pick<MemberView, "short" | "color" | "party">; className?: string }) {
  return (
    <span
      title={member.party}
      className={`inline-flex min-w-7 items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${className}`}
      style={{ backgroundColor: member.color, textShadow: "0 0 2px rgba(0,0,0,.45)" }}
    >
      {member.short}
    </span>
  );
}

export function PartyChip({ member }: { member: MemberView }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white py-0.5 pl-0.5 pr-2.5 text-xs dark:border-zinc-700 dark:bg-zinc-900">
      <PartyBadge member={member} className="rounded-full" />
      {member.name}
    </span>
  );
}
