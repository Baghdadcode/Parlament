// Pure helpers for the Riksdag's conventions: riksmöte numbering, dates, speaking time, replik mentions,
// the Speaker's decision format and the weighted main vote. Shared by the server and the browser.
import type { MemberDef, VoteChoice } from "./types";

/** The riksmöte (parliamentary year) starts in September: 6 Oct 2026 -> "2026/27", 3 Mar 2027 -> "2026/27". */
export function riksmote(d: Date): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

const WEEKDAYS = ["Söndagen", "Måndagen", "Tisdagen", "Onsdagen", "Torsdagen", "Fredagen", "Lördagen"];
const MONTHS = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** "Tisdagen den 6 oktober 2026", as the record of proceedings writes it. */
export function sittingDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} den ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "kl. 13.05" */
export function sittingTime(d: Date): string {
  return `kl. ${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "den 6 oktober 2026" */
export function shortDate(d: Date): string {
  return `den ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const WORDS_PER_MINUTE = 130;

export const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Speaking time for a number of words at a calm chamber pace: 360 words -> "2:46". */
export function speakingTimeForWords(words: number): string {
  const secs = Math.round((words / WORDS_PER_MINUTE) * 60);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export const speakingTime = (text: string) => speakingTimeForWords(wordCount(text));

const L = "\\p{L}";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The "## Replik" section of a rebuttal, or the whole text when there is none. */
export function replikSection(text: string): string {
  const m = /^#{1,6}\s*Replik\s*:?\s*$/im.exec(text);
  if (!m) return text;
  const rest = text.slice(m.index + m[0].length);
  const end = /^#{1,6}\s+\S/m.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

/**
 * Which other members a statement answers by name (full name or surname, also in the genitive). Used for the
 * replik arcs in the chamber and "replik" marks in the record.
 */
export function mentions(text: string, members: Pick<MemberDef, "id" | "name">[], selfId: string): string[] {
  const section = replikSection(text);
  return members
    .filter((m) => m.id !== selfId)
    .filter((m) => {
      const parts = m.name.trim().split(/\s+/);
      const names = [m.name, ...(parts.length > 1 && parts.at(-1)!.length > 2 ? [parts.at(-1)!] : [])];
      return new RegExp(`(?<![${L}])(${names.map(escapeRe).join("|")})s?(?![${L}])`, "u").test(section);
    })
    .map((m) => m.id);
}

/** "förslag B och E" -> "förslag B (V) och E (MP)", so a reader (or voter) knows whose proposals they are. */
export function annotateLabels(text: string, labels: { label: string; short: string }[]): string {
  if (labels.length === 0) return text;
  const byLabel = new Map(labels.map((l) => [l.label, l.short]));
  const letter = "[A-I]";
  // Skip letters that already carry their party, e.g. "förslag B (V)".
  const annotated = `\\s*\\((?:${[...new Set(labels.map((l) => l.short))].map(escapeRe).join("|")})\\)`;
  const list = new RegExp(`([Ff]örslag(?:en|et)?:?\\s+)(${letter}(?:\\s*(?:,|och|&|samt)\\s*${letter})*)(?![${L}])(?!${annotated})`, "gu");
  return text.replace(list, (_all, head: string, letters: string) => {
    const withParties = letters.replace(new RegExp(`\\b(${letter})\\b`, "g"), (l: string) => (byLabel.has(l) ? `${l} (${byLabel.get(l)})` : l));
    return head + withParties;
  });
}

export interface Reservation {
  number: number;
  title: string;
  /** Proposal letters behind the reservation. */
  letters: string[];
  text: string;
}

export interface Decision {
  /** Text before the first heading, e.g. "Valt förslag: C …" in Speaker-decides mode. */
  preamble: string;
  title: string | null;
  beslut: string;
  motivering: string;
  risker: string;
  reservations: Reservation[];
  /** Any other sections, kept so nothing the Speaker wrote is lost. */
  other: string;
}

/** Splits the Speaker's text into the formal parts of a decision. Tolerates missing sections. */
export function parseDecision(text: string): Decision {
  const d: Decision = { preamble: "", title: null, beslut: "", motivering: "", risker: "", reservations: [], other: "" };
  const parts = `\n${text}`.split(/\n(?=##\s)/);
  d.preamble = parts[0]!.trim();
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    const heading = (nl === -1 ? part : part.slice(0, nl)).replace(/^##\s*/, "").replace(/:$/, "").trim();
    const body = nl === -1 ? "" : part.slice(nl + 1).trim();
    const key = heading.toLowerCase();
    if (key.startsWith("rubrik")) d.title = body.split("\n")[0]!.replace(/^[#*\s]+|[*\s]+$/g, "") || null;
    else if (key.startsWith("beslut")) d.beslut = body;
    else if (key.startsWith("motivering")) d.motivering = body;
    else if (key.startsWith("risk")) d.risker = body;
    else if (key.startsWith("reservation")) d.reservations = parseReservations(body);
    else d.other += `${d.other ? "\n\n" : ""}## ${heading}\n${body}`;
  }
  if (!d.beslut && !d.title && parts.length === 1) d.beslut = d.preamble;
  return d;
}

function parseReservations(body: string): Reservation[] {
  const chunks = `\n${body}`.split(/\n(?=###\s)/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length === 0) return [];
  if (!chunks[0]!.startsWith("###")) {
    // No sub-headings: one reservation with the whole text.
    return [{ number: 1, title: "", letters: lettersIn(body), text: body.trim() }];
  }
  return chunks.map((c, i) => {
    const nl = c.indexOf("\n");
    const heading = (nl === -1 ? c : c.slice(0, nl)).replace(/^###\s*/, "").trim();
    const text = nl === -1 ? "" : c.slice(nl + 1).trim();
    const m = /^Reservation\s*(\d+)?\s*(?:\(([^)]*)\))?\s*[:–—-]?\s*(.*)$/i.exec(heading);
    return {
      number: m?.[1] ? Number(m[1]) : i + 1,
      title: (m ? m[3] : heading)?.trim() ?? "",
      letters: m?.[2] ? lettersIn(m[2]) : [],
      text,
    };
  });
}

const lettersIn = (s: string) => [...new Set(s.match(/\b[A-I]\b/g) ?? [])];

/** The "Riksdagen beslutar att" opener is printed by the document itself, so strip it from the text. */
export function beslutPoints(beslut: string): string {
  return beslut.replace(/^\s*\**Riksdagen beslutar att\**:?\s*/i, "").trim();
}

export interface FinalVote {
  seatId: string;
  choice: VoteChoice | "franvarande";
  explanation: string;
  /** Seats this vote carries. */
  weight: number;
}

export interface FinalVoteTally {
  ja: number;
  nej: number;
  avstar: number;
  franvarande: number;
  /** Ja beats Nej (avstår does not count); null when nobody voted. */
  passed: boolean | null;
}

/** Each party votes with its seats; when no member file sets seats, every member counts as one vote. */
export function voteWeight(member: Pick<MemberDef, "seats">, all: Pick<MemberDef, "seats">[]): number {
  return all.some((m) => m.seats > 0) ? member.seats : 1;
}

export function tallyVotes(votes: Pick<FinalVote, "choice" | "weight">[]): FinalVoteTally {
  const t = { ja: 0, nej: 0, avstar: 0, franvarande: 0 };
  for (const v of votes) t[v.choice] += v.weight;
  const voted = t.ja + t.nej + t.avstar;
  return { ...t, passed: voted === 0 ? null : t.ja > t.nej };
}
