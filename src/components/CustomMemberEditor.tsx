"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface CustomFile {
  file: string;
  content: string;
}

/** Create, upload, edit and delete your own members: markdown files in members/egna/. */
export function CustomMemberEditor({
  initial,
  errors,
  template,
}: {
  initial: CustomFile[];
  errors: { file: string; error: string }[];
  template: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.file ?? null);
  const original = files.find((f) => f.file === selected)?.content ?? "";
  const [content, setContent] = useState(initial[0]?.content ?? template);
  const [creating, setCreating] = useState(initial.length === 0);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  // An untouched template is not worth a "discard changes?" question.
  const dirty = creating ? content.trim() !== "" && content !== template : content !== original;
  const errorOf = (file: string) => errors.find((e) => e.file.endsWith(`/${file}`))?.error;

  function confirmDiscard() {
    return !dirty || confirm("Kasta osparade ändringar?");
  }

  function pick(f: CustomFile) {
    if (!confirmDiscard()) return;
    setSelected(f.file);
    setContent(f.content);
    setCreating(false);
    setStatus(null);
  }

  function startNew(text = template): boolean {
    if (!confirmDiscard()) return false;
    setSelected(null);
    setContent(text);
    setCreating(true);
    setStatus(null);
    return true;
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    if (upload.current) upload.current.value = "";
    if (startNew(text)) setStatus({ text: `${file.name} inläst. Granska och spara.` });
  }

  async function save() {
    setStatus({ text: "Sparar…" });
    const res = await fetch("/api/egna", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, previous: creating ? null : selected }),
    });
    const body = (await res.json()) as CustomFile & { error?: string };
    if (!res.ok) return setStatus({ text: body.error ?? "Kunde inte spara", error: true });
    setFiles((list) => [...list.filter((f) => f.file !== body.file && f.file !== selected), body].sort((a, b) => a.file.localeCompare(b.file)));
    setSelected(body.file);
    setContent(body.content);
    setCreating(false);
    setStatus({ text: `Sparad som members/egna/${body.file}. Välj ledamoten under Debatt 1 mot 1 på frågesidan.` });
    router.refresh();
  }

  async function remove() {
    if (!selected || !confirm(`Ta bort members/egna/${selected}? Tidigare debatter behåller sin kopia.`)) return;
    const res = await fetch(`/api/egna?file=${encodeURIComponent(selected)}`, { method: "DELETE" });
    if (!res.ok) return setStatus({ text: "Kunde inte ta bort filen", error: true });
    const rest = files.filter((f) => f.file !== selected);
    setFiles(rest);
    setSelected(rest[0]?.file ?? null);
    setContent(rest[0]?.content ?? "");
    setCreating(rest.length === 0);
    setStatus(null);
    router.refresh();
  }

  return (
    <div className="grid gap-5 md:grid-cols-[220px_1fr]">
      <nav aria-label="Egna ledamöter" className="space-y-1">
        {files.map((f) => {
          const err = errorOf(f.file);
          const active = f.file === selected && !creating;
          return (
            <button
              key={f.file}
              onClick={() => pick(f)}
              className={`block w-full rounded-md px-3 py-2 text-left font-mono text-xs ${active ? "bg-riks-navy text-white" : "hover:bg-zinc-200 dark:hover:bg-zinc-800"}`}
            >
              {f.file}
              {err && <span className={`block font-sans text-[11px] ${active ? "text-red-200" : "text-red-600"}`}>fel i filen</span>}
            </button>
          );
        })}
        <button
          onClick={() => startNew()}
          className={`block w-full rounded-md border border-dashed px-3 py-2 text-left text-sm ${
            creating ? "border-riks-gold bg-riks-gold-soft/20 text-zinc-800 dark:text-zinc-200" : "border-zinc-300 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          }`}
        >
          + Ny ledamot
        </button>
        <button
          onClick={() => upload.current?.click()}
          className="block w-full rounded-md border border-dashed border-zinc-300 px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          ⇪ Ladda upp .md-fil
        </button>
        <input
          ref={upload}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          aria-label="Ladda upp en ledamotsfil"
          className="hidden"
          onChange={(e) => onUpload(e.target.files?.[0])}
        />
      </nav>

      <div className="space-y-3">
        <div>
          <label htmlFor="custom-content" className="mb-1 block text-sm font-medium">
            {creating ? "Ny ledamot" : `members/egna/${selected}`}{" "}
            <span className="font-normal text-zinc-400">(markdown: bara name: krävs, resten är valfritt)</span>
          </label>
          <textarea
            id="custom-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={22}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-zinc-300 bg-transparent p-3 font-mono text-xs leading-relaxed dark:border-zinc-700"
          />
          {!creating && selected && errorOf(selected) && (
            <p role="alert" className="rounded-md bg-red-50 p-2 font-mono text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errorOf(selected)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={!dirty}
            className="rounded-lg bg-riks-navy px-4 py-2 text-sm font-medium text-white hover:bg-riks-navy-2 disabled:opacity-40"
          >
            {creating ? "Skapa ledamot" : "Spara ändringar"}
          </button>
          {!creating && selected && (
            <button onClick={remove} className="rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
              Ta bort
            </button>
          )}
          {status && (
            <span role={status.error ? "alert" : "status"} className={`text-sm ${status.error ? "text-red-600" : "text-zinc-500"}`}>
              {status.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
