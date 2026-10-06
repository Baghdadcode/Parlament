"use client";

import { useState } from "react";
import { sittingDate, sittingTime } from "../core/riksdag";
import { Chamber } from "./Chamber";
import { Protokoll } from "./Protokoll";
import { Riksdagsbeslut } from "./Riksdagsbeslut";
import { StageStepper } from "./StageStepper";
import { Voteringstavla } from "./Voteringstavla";
import { VoteMatrix } from "./VoteMatrix";
import { modelLabel } from "../config/models";
import { date, usd } from "./format";
import { isLive, type SessionModel } from "./model";

export interface SessionHeader {
  question: string;
  brief: { name: string; updatedAt: string } | null;
  usage?: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; models?: string[] };
}

/** A sitting of the chamber: the live chamber view, or the record of proceedings. */
export function SessionReport({ header, model }: { header: SessionHeader; model: SessionModel }) {
  const [tab, setTab] = useState<"kammaren" | "protokoll">("kammaren");
  const live = isLive(model);
  const when = model.createdAt ? new Date(model.createdAt) : null;
  const finished = model.stage === "done";

  const decision = <Riksdagsbeslut key="beslut" model={model} question={header.question} />;
  const board = <Voteringstavla key="board" model={model} />;
  const chamber = <Chamber key="chamber" model={model} />;
  const preliminary =
    model.mode === "full" ? (
      <details key="prelim" open={live && model.stage !== "synthesizing" && model.stage !== "voting" ? true : undefined} className="group">
        <summary className="cursor-pointer select-none font-serif text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Förberedande votering (anonym rangordning av slutförslagen)
        </summary>
        <div className="mt-2">
          <VoteMatrix model={model} />
        </div>
      </details>
    ) : null;
  // Live: follow the sitting from the chamber down. Afterwards: the decision first.
  const order = finished ? [decision, board, chamber, preliminary] : [chamber, board, decision, preliminary];

  return (
    <div className="space-y-5">
      <header className="no-print space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {model.riksmote && (
            <span className="font-serif text-sm text-zinc-700 dark:text-zinc-300">
              Riksdagens protokoll {model.riksmote}:{model.number}
            </span>
          )}
          {when && (
            <span className="font-serif italic">
              {sittingDate(when)}, {sittingTime(when)}
            </span>
          )}
          <span className="rounded border border-riks-gold/60 px-1.5 py-px text-[10px] font-semibold tracking-widest text-riks-gold">SIMULERING</span>
          {live && (
            <span className="flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> DIREKT FRÅN KAMMAREN
            </span>
          )}
        </div>
        <p className="font-serif text-xs uppercase tracking-[0.2em] text-riks-gold">§ 1 Partiledardebatt</p>
        <h1 className="whitespace-pre-wrap font-serif text-2xl font-semibold leading-snug">{header.question}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>
            {model.seats.length} partiledare · {model.rounds} replikskifte{model.rounds === 1 ? "" : "n"}
          </span>
          <span>{model.mode === "full" ? "Förberedande votering" : "Talmannen avgör"} + huvudvotering</span>
          <span title="AI-modellen som partiledarna och talmannen använde">
            AI:{" "}
            {(header.usage?.models?.length ? header.usage.models : [...new Set([...model.seats, model.talman].map((m) => m.model))])
              .map(modelLabel)
              .join(", ")}
          </span>
          {header.brief ? (
            <span title="Bakgrunden som den såg ut när sessionen kördes">
              Bakgrund: {header.brief.name} (ändrad {date(header.brief.updatedAt)})
            </span>
          ) : (
            <span>Ingen bakgrund</span>
          )}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Kostnad {usd(model.costUsd)}</span>
          {header.usage && (
            <span title="Tokens som lästes från promptcachen">
              {header.usage.calls} anrop · cacheläsningar {header.usage.cacheReadTokens.toLocaleString("sv-SE")} tokens
            </span>
          )}
        </div>
        <StageStepper model={model} />
        {model.notice && live && (
          <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            ⏳ {model.notice}
          </p>
        )}
        {model.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {model.error}
          </p>
        )}
        <div role="tablist" aria-label="Visa" className="flex gap-1 border-b border-zinc-300 pt-2 dark:border-zinc-700">
          {(
            [
              ["kammaren", "Kammaren"],
              ["protokoll", "Protokoll"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-4 py-2 font-serif text-sm ${
                tab === k ? "border-riks-gold font-semibold text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === "kammaren" ? (
        <div className="space-y-6">{order}</div>
      ) : (
        <Protokoll model={model} question={header.question} briefName={header.brief?.name ?? null} />
      )}
    </div>
  );
}
