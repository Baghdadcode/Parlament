import { initials } from "./hemicycle";
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

/** Initials in a party-coloured circle, standing in for a portrait. */
export function Avatar({ member, size = 40 }: { member: Pick<MemberView, "name" | "color" | "short">; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-serif font-semibold text-white ring-2 ring-white/70 dark:ring-black/40"
      style={{ width: size, height: size, backgroundColor: member.color, fontSize: size * 0.38, textShadow: "0 0 3px rgba(0,0,0,.5)" }}
    >
      {initials(member.name)}
    </span>
  );
}
