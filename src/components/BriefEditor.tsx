"use client";

import { useState } from "react";
import { dateTime } from "./format";
import type { BriefView } from "../core/view";

export function BriefEditor({ initial }: { initial: BriefView[] }) {
  const [briefs, setBriefs] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const selected = briefs.find((b) => b.id === selectedId) ?? null;
  const [name, setName] = useState(selected?.name ?? "");
  const [content, setContent] = useState(selected?.content ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const dirty = selected ? name !== selected.name || content !== selected.content : name.trim() !== "" || content.trim() !== "";

  function pick(b: BriefView | null) {
    if (dirty && !confirm("Kasta osparade ändringar?")) return;
    setSelectedId(b?.id ?? null);
    setName(b?.name ?? "");
    setContent(b?.content ?? "");
    setStatus(null);
  }

  async function save() {
    setStatus("Sparar…");
    const res = await fetch(selected ? `/api/briefs/${selected.id}` : "/api/briefs", {
      method: selected ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content }),
    });
    const body = (await res.json()) as BriefView & { error?: string };
    if (!res.ok) return setStatus(body.error ?? "Kunde inte spara");
    setBriefs((list) => [...list.filter((b) => b.id !== body.id), body].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(body.id);
    setStatus("Sparad");
  }

  async function remove() {
    if (!selected || !confirm(`Ta bort "${selected.name}"? Tidigare sessioner behåller sin kopia.`)) return;
    await fetch(`/api/briefs/${selected.id}`, { method: "DELETE" });
    const rest = briefs.filter((b) => b.id !== selected.id);
    setBriefs(rest);
    setSelectedId(rest[0]?.id ?? null);
    setName(rest[0]?.name ?? "");
    setContent(rest[0]?.content ?? "");
  }

  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr]">
      <nav aria-label="Bakgrunder" className="space-y-1">
        {briefs.map((b) => (
          <button
            key={b.id}
            onClick={() => pick(b)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm ${b.id === selectedId ? "bg-indigo-600 text-white" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"}`}
          >
            {b.name}
            <span className={`block text-[11px] ${b.id === selectedId ? "text-indigo-100" : "text-zinc-500"}`}>Ändrad {dateTime(b.updatedAt)}</span>
          </button>
        ))}
        <button onClick={() => pick(null)} className="block w-full rounded-md border border-dashed border-zinc-300 px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
          + Ny bakgrund
        </button>
      </nav>

      <div className="space-y-3">
        <div>
          <label htmlFor="brief-name" className="mb-1 block text-sm font-medium">
            Namn
          </label>
          <input
            id="brief-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm dark:border-zinc-700"
          />
        </div>
        <div>
          <label htmlFor="brief-content" className="mb-1 block text-sm font-medium">
            Innehåll <span className="font-normal text-zinc-400">(text eller markdown: fakta, siffror, förutsättningar)</span>
          </label>
          <textarea
            id="brief-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent p-3 font-mono text-xs leading-relaxed dark:border-zinc-700"
          />
          <p className="text-xs text-zinc-500">~{Math.ceil(content.length / 4).toLocaleString("sv-SE")} tokens. Skickas till alla partiledare och talmannen när den bifogas.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty || !name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {selected ? "Spara ändringar" : "Skapa bakgrund"}
          </button>
          {selected && (
            <button onClick={remove} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
              Ta bort
            </button>
          )}
          {status && <span className="text-sm text-zinc-500">{status}</span>}
        </div>
      </div>
    </div>
  );
}
