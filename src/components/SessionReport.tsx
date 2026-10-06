import { DebateRounds } from "./DebateRounds";
import { StageStepper } from "./StageStepper";
import { VerdictCard } from "./VerdictCard";
import { VoteMatrix } from "./VoteMatrix";
import { date, dateTime, usd } from "./format";
import type { SessionModel } from "./model";

export interface SessionHeader {
  question: string;
  createdAt?: string;
  brief: { name: string; updatedAt: string } | null;
  usage?: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

export function SessionReport({ header, model }: { header: SessionHeader; model: SessionModel }) {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="whitespace-pre-wrap text-lg font-medium leading-snug">{header.question}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>
            {model.seats.length} partiledare · {model.rounds} replikrund{model.rounds === 1 ? "a" : "or"}
          </span>
          <span>{model.mode === "full" ? "Votering" : "Talmannen avgör"}</span>
          {header.createdAt && <span>{dateTime(header.createdAt)}</span>}
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
        {model.error && (
          <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {model.error}
          </p>
        )}
      </header>
      <VerdictCard model={model} />
      <VoteMatrix model={model} />
      <DebateRounds model={model} />
    </div>
  );
}
