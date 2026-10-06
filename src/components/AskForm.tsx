"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { date, usd } from "./format";
import { PartyChip } from "./PartyChip";
import type { BriefView, MemberView } from "../core/view";
import type { VotingMode } from "../core/types";

export function AskForm({
  members,
  rounds,
  briefs,
  canRunAtAll,
}: {
  members: MemberView[];
  rounds: number;
  briefs: BriefView[];
  canRunAtAll: boolean;
}) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [briefId, setBriefId] = useState<string>("");
  const [mode, setMode] = useState<VotingMode>("full");
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
          body: JSON.stringify({ briefId: briefId || null, mode, question }),
        });
        setEstimate(res.ok ? ((await res.json()) as { usd: number }).usd : null);
      } catch {
        setEstimate(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [briefId, mode, question]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, briefId: briefId || null, mode }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? `Förfrågan misslyckades (${res.status})`);
      router.push(`/sessions/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const canRun = canRunAtAll && question.trim().length >= 3 && !submitting;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div>
        <label htmlFor="question" className="mb-1 block text-sm font-medium">
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
          className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-zinc-700"
        />
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">
          I kammaren <span className="font-normal text-zinc-400">({members.length} partiledare, öppning + {rounds} replikrundor)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <PartyChip key={m.id} member={m} />
          ))}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Ändra personligheter i <code>members/*.md</code>; ändringarna gäller från nästa fråga.{" "}
          <Link href="/ledamoter" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Visa ledamöter
          </Link>
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
            <Link href="/bakgrund" className="text-indigo-600 hover:underline dark:text-indigo-400">
              Redigera bakgrunder
            </Link>
          </p>
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Beslut</legend>
          <div className="space-y-1 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "full"} onChange={() => setMode("full")} className="mt-1" />
              <span>
                Votering <span className="block text-xs text-zinc-500">Partiledarna rangordnar varandras slutförslag anonymt, sedan skriver talmannen beslutet</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "chairman"} onChange={() => setMode("chairman")} className="mt-1" />
              <span>
                Talmannen avgör <span className="block text-xs text-zinc-500">Snabbare och billigare; ingen votering</span>
              </span>
            </label>
          </div>
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
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Kallar till debatt…" : "Fråga riksdagen"}
        </button>
      </div>
    </form>
  );
}
