// Geometry for the chamber diagram: seats in concentric half-rings, filled left to right one party at a time.
import type { MemberView } from "../core/view";

export const VIEW = { width: 400, height: 214, cx: 200, cy: 204, outer: 192, inner: 84 } as const;

export interface Seat {
  x: number;
  y: number;
  r: number;
  angle: number;
}

/** Dots shown for a party whose file sets no seats. */
export const DEFAULT_SEATS = 15;

const round = (n: number) => Math.round(n * 100) / 100;

/** Places `total` seats in rows whose seat counts grow with their radius, so the spacing is even. */
export function seatLayout(total: number): Seat[] {
  if (total <= 0) return [];
  const { cx, cy, outer, inner } = VIEW;
  const rows = Math.max(2, Math.min(12, Math.round(Math.sqrt(total / 3.4))));
  const radii = Array.from({ length: rows }, (_, i) => inner + ((outer - inner) * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.max(1, Math.round((total * r) / sum)));
  // Fix rounding on the outer row so the total is exact.
  counts[rows - 1]! += total - counts.reduce((a, b) => a + b, 0);
  const rowGap = (outer - inner) / (rows - 1);
  const seats: Seat[] = [];
  radii.forEach((radius, i) => {
    const n = counts[i]!;
    if (n <= 0) return;
    const arcGap = (Math.PI * radius) / n;
    const r = Math.min(rowGap, arcGap) * 0.4;
    for (let j = 0; j < n; j++) {
      const angle = Math.PI * (1 - (j + 0.5) / n);
      // Rounded so server and browser render identical attributes (no hydration mismatch on float digits).
      seats.push({ x: round(cx + radius * Math.cos(angle)), y: round(cy - radius * Math.sin(angle)), r: round(r), angle });
    }
  });
  // Left to right; within the same angle, inner rows first.
  return seats.sort((a, b) => b.angle - a.angle || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
}

export interface PartySeats {
  member: MemberView;
  seats: Seat[];
  /** Centre of the party's block, where replik arcs start and end. */
  centroid: { x: number; y: number };
}

/** Members in chamber order (left to right) with their share of the seats. */
export function chamberSeats(members: MemberView[]): PartySeats[] {
  const ordered = [...members].sort((a, b) => a.placement - b.placement);
  const anySeats = ordered.some((m) => m.seats > 0);
  const count = (m: MemberView) => (anySeats ? m.seats : DEFAULT_SEATS);
  const layout = seatLayout(ordered.reduce((n, m) => n + count(m), 0));
  let i = 0;
  return ordered.map((member) => {
    const seats = layout.slice(i, i + count(member));
    i += count(member);
    const centroid = seats.length
      ? { x: round(seats.reduce((n, s) => n + s.x, 0) / seats.length), y: round(seats.reduce((n, s) => n + s.y, 0) / seats.length) }
      : { x: VIEW.cx, y: VIEW.cy };
    return { member, seats, centroid };
  });
}

/** A curved arrow from one party block to another, bending in towards the floor of the chamber. */
export function arcPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const cx = mx + (VIEW.cx - mx) * 0.55;
  const cy = my + (VIEW.cy - 40 - my) * 0.55;
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export const initials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase();
};
