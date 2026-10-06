import type { MemberDef } from "./types";

export const LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;

export interface AnonymizedSet {
  reviewerId: string;
  /** Presented to the reviewer in this order, labelled A, B, C... */
  presented: { label: string; answerId: string; text: string }[];
  labelToAnswerId: Map<string, string>;
}

/** Fisher-Yates with an injectable RNG so tests are deterministic. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Identity = Pick<MemberDef, "name" | "party" | "short">;

/**
 * Removes what would give away who wrote a proposal: leader names (full and surname), party names (also in the
 * genitive), and party abbreviations. Single-letter abbreviations ("S", "M") are only removed in parentheses or
 * before a dash ("S-regeringen"), so ordinary words survive; longer ones ("SD", "KD") are removed as words.
 */
export function redactIdentities(text: string, identities: Identity[]): string {
  if (identities.length === 0) return text;
  const people = new Set<string>();
  const parties = new Set<string>();
  const shorts = new Set<string>();
  for (const m of identities) {
    people.add(m.name);
    const parts = m.name.trim().split(/\s+/);
    if (parts.length > 1 && parts.at(-1)!.length > 2) people.add(parts.at(-1)!);
    parties.add(m.party);
    // "Miljöpartiet de gröna" is mostly called "Miljöpartiet".
    const first = m.party.split(/\s+/)[0]!;
    if (first.length > 3) parties.add(first);
    shorts.add(m.short);
  }
  const alt = (xs: Set<string>) => [...xs].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const W = "\\p{L}\\p{N}";
  let out = text;
  out = out.replace(new RegExp(`(?<![${W}])(${alt(people)}):?s?(?![${W}])`, "giu"), "[partiledare]");
  out = out.replace(new RegExp(`(?<![${W}])(${alt(parties)})s?(?![${W}])`, "giu"), "[parti]");
  const shortList = [...shorts];
  const multi = shortList.filter((s) => s.length > 1);
  const all = alt(shorts);
  out = out.replace(new RegExp(`\\((${all})\\)`, "gu"), "([parti])");
  out = out.replace(new RegExp(`(?<![${W}])(${all})(?=-[${W}])`, "gu"), "[parti]");
  if (multi.length > 0) out = out.replace(new RegExp(`(?<![${W}])(${alt(new Set(multi))})(?:s|:s)?(?![${W}])`, "gu"), "[parti]");
  return out;
}

/**
 * Builds the blind view for one voter: their own proposal is excluded (no self-ranking), identifying text is
 * redacted, and the order is freshly shuffled for every voter.
 */
export function anonymizeFor(
  reviewer: Pick<MemberDef, "id">,
  answers: { answerId: string; seatId: string; text: string }[],
  identities: Identity[],
  rng: () => number = Math.random,
): AnonymizedSet {
  const others = answers.filter((a) => a.seatId !== reviewer.id);
  if (others.length > LABELS.length) throw new Error("Too many answers to label");
  const presented = shuffle(others, rng).map((a, idx) => ({
    label: LABELS[idx]!,
    answerId: a.answerId,
    text: redactIdentities(a.text, identities),
  }));
  return {
    reviewerId: reviewer.id,
    presented,
    labelToAnswerId: new Map(presented.map((p) => [p.label, p.answerId])),
  };
}
