"use client";

import { arcPath, chamberSeats, VIEW } from "./hemicycle";
import type { VoteState } from "./model";
import type { MemberView } from "../core/view";

export const VOTE_COLORS = { ja: "#22c55e", nej: "#ef4444", avstar: "#eab308", franvarande: "#6b7280" } as const;

export interface ReplikArc {
  from: string;
  to: string;
  /** Arcs of the speech being shown are drawn strongly; the rest of the round faintly. */
  strong: boolean;
}

/**
 * The chamber: one block of seats per party, the Speaker's podium and the rostrum in the opening. The speaking
 * party glows, replik arcs show who answers whom, and during the vote the seats light up like the voting board.
 */
export function Hemicycle({
  seats,
  speakingId = null,
  votes,
  colorBy = "party",
  arcs = [],
  onSelect,
  className = "",
}: {
  seats: MemberView[];
  speakingId?: string | null;
  votes?: Record<string, VoteState>;
  colorBy?: "party" | "vote";
  arcs?: ReplikArc[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const parties = chamberSeats(seats);
  const centroid = new Map(parties.map((p) => [p.member.id, p.centroid]));
  const color = new Map(seats.map((s) => [s.id, s.color]));
  const speaker = speakingId ? seats.find((s) => s.id === speakingId) : undefined;
  const total = seats.reduce((n, s) => n + s.seats, 0);
  const { cx, cy } = VIEW;

  return (
    <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-label="Kammaren" className={`w-full ${className}`}>
      <defs>
        {seats.map((s) => (
          <marker key={s.id} id={`arrow-${s.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={s.color} />
          </marker>
        ))}
      </defs>

      {parties.map(({ member, seats: dots }) => {
        const vote = votes?.[member.id];
        const fill = colorBy === "vote" ? (vote ? VOTE_COLORS[vote.choice] : member.color) : member.color;
        const pendingVote = colorBy === "vote" && !vote;
        const dim = (speakingId && speakingId !== member.id) || pendingVote;
        return (
          <g
            key={member.id}
            data-party={member.short}
            onClick={onSelect ? () => onSelect(member.id) : undefined}
            className={`${onSelect ? "cursor-pointer" : ""} ${speakingId === member.id ? "speaking" : ""}`}
            opacity={dim ? 0.28 : 1}
          >
            <title>
              {`${member.name} (${member.short})${member.seats ? ` · ${member.seats} mandat` : ""}${vote ? ` · ${vote.choice === "avstar" ? "avstår" : vote.choice === "franvarande" ? "frånvarande" : vote.choice}` : ""}`}
            </title>
            {dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={fill} />
            ))}
          </g>
        );
      })}

      {arcs.map((a, i) => {
        const from = centroid.get(a.from);
        const to = centroid.get(a.to);
        if (!from || !to) return null;
        return (
          <path
            key={`${a.from}-${a.to}-${i}`}
            d={arcPath(from, to)}
            fill="none"
            stroke={color.get(a.from)}
            strokeWidth={a.strong ? 2.2 : 1}
            strokeOpacity={a.strong ? 0.95 : 0.25}
            strokeLinecap="round"
            markerEnd={a.strong ? `url(#arrow-${a.from})` : undefined}
          />
        );
      })}

      {/* The Speaker's podium and the rostrum, in the opening of the chamber. */}
      <rect x={cx - 42} y={cy - 54} width={84} height={18} rx={3} className="fill-riks-navy dark:fill-riks-navy-2" stroke="#b3923f" strokeWidth={1} />
      <text x={cx} y={cy - 42} textAnchor="middle" fontSize={7.5} letterSpacing={1.5} fill="#e9dcb6" className="font-serif">
        TALMANNEN
      </text>
      <rect x={cx - 30} y={cy - 28} width={60} height={16} rx={3} fill={speaker ? speaker.color : "#9ca3af"} opacity={speaker ? 1 : 0.5} />
      <text x={cx} y={cy - 17} textAnchor="middle" fontSize={7} fontWeight={700} fill="white" style={{ textShadow: "0 0 2px rgba(0,0,0,.6)" }}>
        {speaker ? speaker.short : "TALARSTOL"}
      </text>
      {total > 0 && (
        <text x={cx} y={cy + 7} textAnchor="middle" fontSize={6.5} className="fill-zinc-500">
          {total} mandat
        </text>
      )}
    </svg>
  );
}
