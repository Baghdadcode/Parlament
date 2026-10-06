import type { CallStatus } from "../core/types";

export const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

export const date = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Swedish ordinal: 1:a, 2:a, 3:e ... */
export const ordinal = (n: number) => `${n}:${n % 10 === 1 || n % 10 === 2 ? (n % 100 === 11 || n % 100 === 12 ? "e" : "a") : "e"}`;

export const roundLabel = (round: number) => (round === 0 ? "Anföranden" : `Replikskifte ${round}`);

/** Short status for the speakers' list. */
export function phaseShort(phase: CallStatus | undefined): string {
  if (!phase || phase.kind === "queued") return "i kö";
  if (phase.kind === "started") return "förbereder";
  if (phase.kind === "thinking") return "tänker…";
  return `väntar ${Math.max(1, Math.round(phase.waitMs / 1000))} s`;
}

/** Longer status for the rostrum, while a speech has no text yet. */
export function phaseLong(name: string, phase: CallStatus | undefined): string {
  if (!phase || phase.kind === "queued") return `${name} väntar på sin tur i talarkön…`;
  if (phase.kind === "started") return `${name} går upp i talarstolen…`;
  if (phase.kind === "thinking") return `${name} tänker igenom sitt anförande…`;
  return `${phase.reason}. Nytt försök om ${Math.max(1, Math.round(phase.waitMs / 1000))} s (försök ${phase.attempt} av ${phase.maxAttempts - 1}).`;
}
