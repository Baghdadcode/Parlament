export const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;

export const date = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Swedish ordinal: 1:a, 2:a, 3:e ... */
export const ordinal = (n: number) => `${n}:${n % 10 === 1 || n % 10 === 2 ? (n % 100 === 11 || n % 100 === 12 ? "e" : "a") : "e"}`;

export const roundLabel = (round: number) => (round === 0 ? "Öppning" : `Replik ${round}`);
