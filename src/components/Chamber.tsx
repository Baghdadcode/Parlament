"use client";

import { useState } from "react";
import { mentions } from "../core/riksdag";
import { DebateRounds } from "./DebateRounds";
import { Hemicycle, VOTE_COLORS, type ReplikArc } from "./Hemicycle";
import { Rostrum } from "./Rostrum";
import { Talarlista } from "./Talarlista";
import { anfKey, anforanden, isLive, winnerOf, type Anforande, type SessionModel } from "./model";
import { DuelStage } from "./DuelStage";
import type { PlaybackControls } from "./SessionReport";

/** Which speech the rostrum shows when the viewer has not picked one. */
function autoPick(model: SessionModel, items: Anforande[]): Anforande | null {
  if (model.spotlight) {
    const shown = items.find((i) => anfKey(i) === model.spotlight);
    if (shown) return shown;
  }
  const debating = isLive(model) && (model.stage === "opening" || model.stage === "debating");
  if (debating) {
    const inRound = items.filter((i) => i.round === model.round);
    // Follow the speakers' list: the first speech in order that is not finished yet.
    return inRound.find((i) => i.statement.status === "streaming" || i.statement.status === "pending") ?? inRound.at(-1) ?? null;
  }
  const winner = winnerOf(model);
  const spoken = items.filter((i) => i.statement.text);
  return (winner && spoken.filter((i) => i.seat.id === winner).at(-1)) || spoken.at(-1) || null;
}

/** The chamber: seats, rostrum and speakers' list, or every speech side by side. */
export function Chamber({ model, playback }: { model: SessionModel; playback?: PlaybackControls }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [view, setView] = useState<"kammare" | "alla">("kammare");
  const [colorChoice, setColorChoice] = useState<"auto" | "party" | "vote">("auto");

  const items = anforanden(model);
  const auto = autoPick(model, items);
  const currentKey = picked ?? (auto ? anfKey(auto) : null);
  const current = items.find((i) => anfKey(i) === currentKey) ?? auto;
  const hasVotes = Object.keys(model.votes).length > 0;
  const colorBy = colorChoice === "auto" ? (hasVotes ? "vote" : "party") : colorChoice;

  const arcs: ReplikArc[] = current
    ? items
        .filter((i) => i.round === current.round && i.round > 0 && i.statement.text)
        .flatMap((i) => mentions(i.statement.text, model.seats, i.seat.id).map((to) => ({ from: i.seat.id, to, strong: i === current })))
    : [];

  function selectParty(id: string) {
    const own = items.filter((i) => i.seat.id === id && i.statement.status !== "pending");
    const pick = own.find((i) => i.round === current?.round) ?? own.at(-1);
    if (pick) setPicked(anfKey(pick));
  }

  return (
    <section aria-labelledby="chamber-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="chamber-heading" className="mr-2 font-serif text-lg font-semibold">
          Kammaren
        </h2>
        <Toggle
          options={[
            ["kammare", "Kammarvy"],
            ["alla", "Alla anföranden"],
          ]}
          value={view}
          onChange={setView}
        />
        {view === "kammare" && hasVotes && (
          <Toggle
            options={[
              ["party", "Partifärger"],
              ["vote", "Röster"],
            ]}
            value={colorBy}
            onChange={setColorChoice}
          />
        )}
        {(picked && isLive(model)) || playback ? (
          <div className="ml-auto flex items-center gap-3 text-xs">
            {picked && isLive(model) && (
              <button onClick={() => setPicked(null)} className="font-medium text-red-600 hover:underline dark:text-red-400">
                ● Följ live
              </button>
            )}
            {playback && (
              <>
                <button
                  onClick={() => {
                    setPicked(null);
                    playback.next();
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  title="Hoppa till nästa anförande i talarlistan"
                >
                  Nästa talare ⏭
                </button>
                <button
                  onClick={() => {
                    setPicked(null);
                    playback.showAll();
                  }}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  title="Visa alla anföranden direkt, utan uppspelning"
                >
                  Visa allt
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {view === "alla" ? (
        <DebateRounds model={model} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            {model.format === "duell" ? (
              <DuelStage model={model} speakingId={current?.seat.id ?? null} onSelect={selectParty} />
            ) : (
            <div className="rounded-xl border border-zinc-200 bg-gradient-to-b from-riks-paper to-white p-3 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
              <Hemicycle
                seats={model.seats}
                speakingId={colorBy === "vote" ? null : (current?.seat.id ?? null)}
                votes={model.votes}
                colorBy={colorBy}
                arcs={colorBy === "vote" ? [] : arcs}
                onSelect={selectParty}
              />
              <Legend model={model} colorBy={colorBy} />
            </div>
            )}
            <Rostrum item={current} seats={model.seats} />
          </div>
          <Talarlista
            items={items}
            rounds={model.rounds}
            currentKey={currentKey}
            onSelect={setPicked}
            title={model.format === "duell" ? "Debatt 1 mot 1" : "Partiledardebatt"}
          />
        </div>
      )}
    </section>
  );
}

function Legend({ model, colorBy }: { model: SessionModel; colorBy: "party" | "vote" }) {
  if (colorBy === "vote") {
    const labels = { ja: "Ja", nej: "Nej", avstar: "Avstår", franvarande: "Frånvarande" } as const;
    return (
      <p className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: VOTE_COLORS[k] }} /> {labels[k]}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
      {[...model.seats]
        .sort((a, b) => a.placement - b.placement)
        .map((s) => (
          <span key={s.id} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.short}
            {s.seats > 0 && <span className="text-zinc-400">{s.seats}</span>}
          </span>
        ))}
      <span className="text-zinc-400">· Pilar visar replikskiften. Klicka på ett parti för att läsa.</span>
    </p>
  );
}

function Toggle<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" className="inline-flex rounded-md bg-zinc-200 p-0.5 text-xs dark:bg-zinc-800">
      {options.map(([v, label]) => (
        <button
          key={v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded px-2.5 py-1 font-medium ${value === v ? "bg-white shadow-sm dark:bg-zinc-700" : "text-zinc-600 dark:text-zinc-400"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
