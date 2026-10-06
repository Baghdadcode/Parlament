"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { date, usd } from "./format";
import type { BriefView, MemberView } from "../core/view";
import type { ModelChoices } from "../core/models";
import type { VotingMode } from "../core/types";

export function AskForm({
  members,
  rounds,
  briefs,
  canRunAtAll,
  models,
}: {
  members: MemberView[];
  rounds: number;
  briefs: BriefView[];
  canRunAtAll: boolean;
  models: ModelChoices;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [briefId, setBriefId] = useState<string>("");
  const [mode, setMode] = useState<VotingMode>("full");
  const [model, setModel] = useState<string>(models.defaultValue);
  const allModels = models.groups.flatMap((g) => g.options);
  const selectedModel = allModels.find((o) => o.value === model);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brief = briefs.find((b) => b.id === briefId);

  // Debounced estimate before running.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ briefId: briefId || null, mode, question, model: model || null }),
        });
        setEstimate(res.ok ? ((await res.json()) as { usd: number }).usd : null);
      } catch {
        setEstimate(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [briefId, mode, question, model]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, briefId: briefId || null, mode, model: model || null }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? `Förfrågan misslyckades (${res.status})`);
      router.push(`/sessions/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const canRun = canRunAtAll && !!selectedModel?.available && question.trim().length >= 3 && !submitting;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <p className="font-serif text-xs uppercase tracking-[0.2em] text-riks-gold">Väck en fråga i kammaren</p>
        <label htmlFor="question" className="mb-2 mt-0.5 block font-serif text-xl font-semibold">
          Din fråga till riksdagen
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) e.currentTarget.form?.requestSubmit();
          }}
          rows={4}
          placeholder="t.ex. Hur ska Sverige minska elpriserna för hushållen de kommande fem åren?"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent p-3 outline-none font-serif text-base focus:border-riks-gold focus:ring-2 focus:ring-riks-gold/30 dark:border-zinc-700"
        />
      </div>

      <p className="text-xs text-zinc-500">
        Partiledardebatt med {members.length} partiledare: anföranden och {rounds} replikskiften, sedan votering och talmannens beslut. Ändra
        personligheterna i <code>members/*.md</code>; ändringarna gäller från nästa fråga.{" "}
        <Link href="/ledamoter" className="text-riks-navy underline dark:text-riks-gold-soft">
          Visa ledamöter
        </Link>
      </p>

      <div>
        <label htmlFor="model" className="mb-1 block text-sm font-medium">
          AI-modell
        </label>
        <select
          id="model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {models.groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value || "files"} value={o.value} disabled={!o.available}>
                  {o.label}
                  {o.note ? ` (${o.note})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          {model
            ? "Alla partiledare och talmannen använder den här modellen i den här debatten."
            : "Varje partiledare använder modellen i sin fil (model: …), så du kan blanda Claude och Gemini."}
          {allModels.some((o) => !o.available) && " Gråa modeller saknar en fungerande nyckel i .env.local."}
          {selectedModel?.paced && " Mistrals gratisnivå tillåter ungefär en förfrågan per sekund, så debatten tar några minuter extra."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="brief" className="mb-1 block text-sm font-medium">
            Bakgrund <span className="font-normal text-zinc-400">(valfritt)</span>
          </label>
          <select
            id="brief"
            value={briefId}
            onChange={(e) => setBriefId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Ingen</option>
            {briefs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            {brief ? `Ändrad ${date(brief.updatedAt)} · ` : ""}
            <Link href="/bakgrund" className="text-riks-navy underline dark:text-riks-gold-soft">
              Redigera bakgrunder
            </Link>
          </p>
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Beslutsordning</legend>
          <div className="space-y-1 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "full"} onChange={() => setMode("full")} className="mt-1" />
              <span>
                Förberedande votering{" "}
                <span className="block text-xs text-zinc-500">Partiledarna rangordnar varandras slutförslag anonymt; talmannen bygger sitt förslag på vinnaren</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "chairman"} onChange={() => setMode("chairman")} className="mt-1" />
              <span>
                Talmannen avgör <span className="block text-xs text-zinc-500">Snabbare och billigare; talmannen väljer förslag själv</span>
              </span>
            </label>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Båda avslutas med huvudvotering: ja, nej eller avstår, med partiernas mandat.</p>
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Uppskattad kostnad: <span className="font-medium text-zinc-800 dark:text-zinc-200">{estimate === null ? "…" : `~${usd(estimate)}`}</span>
          <span className="ml-1 text-xs">(grovt; den verkliga kostnaden visas när debatten är klar)</span>
        </p>
        <button
          type="submit"
          disabled={!canRun}
          className="rounded-lg bg-riks-navy px-5 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-riks-gold/60 hover:bg-riks-navy-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Kallar till sammanträde…" : "Fråga riksdagen"}
        </button>
      </div>
    </form>
  );
}
