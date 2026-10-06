import { roundLabel } from "./format";
import type { SessionModel } from "./model";

interface Step {
  key: string;
  label: string;
}

/** Anföranden › Replikskifte 1 › Replikskifte 2 › Förberedande votering › Talmannens förslag › Huvudvotering › Avslutat */
export function StageStepper({ model }: { model: Pick<SessionModel, "stage" | "round" | "rounds" | "mode"> }) {
  const steps: Step[] = Array.from({ length: model.rounds + 1 }, (_, r) => ({ key: `round-${r}`, label: roundLabel(r) }));
  if (model.mode === "full") steps.push({ key: "ranking", label: "Förberedande votering" });
  steps.push({ key: "synthesizing", label: "Talmannens förslag" }, { key: "voting", label: "Huvudvotering" }, { key: "done", label: "Avslutat" });

  const currentKey =
    model.stage === "opening" || model.stage === "debating" ? `round-${model.round}` : model.stage === "counting" ? "ranking" : model.stage;
  const current = steps.findIndex((s) => s.key === currentKey);
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Sammanträdets gång">
      {steps.map((s, i) => {
        const state = model.stage === "failed" ? "idle" : i < current || model.stage === "done" ? "past" : i === current ? "now" : "idle";
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              className={
                state === "past"
                  ? "rounded-full bg-riks-navy px-2.5 py-1 text-white dark:bg-riks-navy-2"
                  : state === "now"
                    ? "rounded-full bg-riks-gold px-2.5 py-1 font-medium text-white"
                    : "rounded-full bg-zinc-200 px-2.5 py-1 text-zinc-500 dark:bg-zinc-800"
              }
              aria-current={state === "now" ? "step" : undefined}
            >
              {s.label}
              {state === "now" && s.key !== "done" ? "…" : ""}
            </span>
            {i < steps.length - 1 && <span className="text-zinc-400">›</span>}
          </li>
        );
      })}
      {model.stage === "failed" && <li className="rounded-full bg-red-600 px-2.5 py-1 text-white">Avbrutet</li>}
    </ol>
  );
}
