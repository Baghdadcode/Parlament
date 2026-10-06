import { roundLabel } from "./format";
import type { SessionModel } from "./model";

interface Step {
  key: string;
  label: string;
}

/** Öppning › Replik 1 › Replik 2 › Votering › Rösträkning › Talmannen › Klart */
export function StageStepper({ model }: { model: Pick<SessionModel, "stage" | "round" | "rounds" | "mode"> }) {
  const steps: Step[] = Array.from({ length: model.rounds + 1 }, (_, r) => ({ key: `round-${r}`, label: roundLabel(r) }));
  if (model.mode === "full") steps.push({ key: "ranking", label: "Votering" }, { key: "counting", label: "Rösträkning" });
  steps.push({ key: "synthesizing", label: "Talmannen" }, { key: "done", label: "Klart" });

  const currentKey = model.stage === "opening" || model.stage === "debating" ? `round-${model.round}` : model.stage;
  const current = steps.findIndex((s) => s.key === currentKey);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Debattens gång">
      {steps.map((s, i) => {
        const state = model.stage === "failed" ? "idle" : i < current || model.stage === "done" ? "past" : i === current ? "now" : "idle";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={
                state === "past"
                  ? "rounded-full bg-zinc-900 px-2.5 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : state === "now"
                    ? "rounded-full bg-indigo-600 px-2.5 py-1 text-white"
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
      {model.stage === "failed" && <li className="rounded-full bg-red-600 px-2.5 py-1 text-white">Misslyckades</li>}
    </ol>
  );
}
