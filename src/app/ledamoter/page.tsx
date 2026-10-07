import { CustomMemberEditor } from "../../components/CustomMemberEditor";
import { Markdown } from "../../components/Markdown";
import { customTemplate, listCustomFiles } from "../../members/custom";
import { PartyBadge } from "../../components/PartyChip";
import { getMembersDir } from "../../config/env";
import { getMembers } from "../../server/runtime";
import type { MemberDef } from "../../core/types";

export const dynamic = "force-dynamic";

export default function MembersPage() {
  const loaded = getMembers();
  const dir = getMembersDir();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl font-semibold">Ledamöter</h1>
        <p className="text-sm text-zinc-500">
          Varje deltagare är en markdown-fil i <code>{dir}</code>. Redigera filen för att ändra personlighet, åsikter, debattstil, modell eller
          ansträngning; filerna läses på nytt vid varje fråga. Sätt <code>enabled: false</code> för att låta någon sitta över. Formatet beskrivs i{" "}
          <code>members/README.md</code>.
        </p>
      </div>
      {!loaded.ok ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 font-mono text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {loaded.error}
        </p>
      ) : (
        <div className="space-y-3">
          {[...loaded.members, loaded.talman, ...loaded.all.filter((m) => !m.enabled)].map((m) => (
            <MemberCard key={`${m.id}-${m.file}`} member={m} />
          ))}
        </div>
      )}

      <section id="egna" aria-labelledby="egna-heading" className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <div>
          <h2 id="egna-heading" className="font-serif text-lg font-semibold">
            Egna ledamöter
          </h2>
          <p className="text-sm text-zinc-500">
            Lägg till vem som helst: dig själv, en historisk person, en lokalpolitiker eller en romanfigur. Varje egen ledamot är en markdown-fil i{" "}
            <code>{dir}/egna</code>, i samma format som partiledarna, men bara <code>name:</code> och en beskrivning krävs. Egna ledamöter kan
            debattera i <strong>Debatt 1 mot 1</strong>, mot en partiledare eller mot varandra. Skriv filen här, ladda upp en färdig .md-fil eller
            lägg den direkt i mappen.
          </p>
        </div>
        {loaded.ok && loaded.custom.length > 0 && (
          <div className="space-y-3">
            {loaded.custom.map((m) => (
              <MemberCard key={`${m.id}-${m.file}`} member={m} />
            ))}
          </div>
        )}
        {loaded.ok && loaded.customErrors.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-md bg-red-50 p-3 font-mono text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {loaded.customErrors.map((e) => (
              <li key={e.file}>{e.error}</li>
            ))}
          </ul>
        )}
        <CustomMemberEditor initial={listCustomFiles()} errors={loaded.ok ? loaded.customErrors : []} template={customTemplate()} />
      </section>
    </div>
  );
}

function MemberCard({ member: m }: { member: MemberDef }) {
  return (
    <details
      className={`rounded-lg border border-l-4 border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${m.enabled ? "" : "opacity-50"}`}
      style={{ borderLeftColor: m.color }}
    >
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 text-sm">
        <PartyBadge member={m} />
        <span className="font-semibold">{m.name}</span>
        <span className="text-zinc-500">
          {m.title}, {m.party}
          {m.seats > 0 ? ` · ${m.seats} mandat` : ""}
        </span>
        {m.role === "talman" && <span className="rounded bg-zinc-200 px-1.5 text-[11px] dark:bg-zinc-800">talman</span>}
        {m.custom && <span className="rounded bg-riks-gold-soft/60 px-1.5 text-[11px] text-zinc-800 dark:bg-riks-gold/20 dark:text-zinc-200">egen</span>}
        {!m.enabled && <span className="rounded bg-zinc-200 px-1.5 text-[11px] dark:bg-zinc-800">sitter över</span>}
        <span className="ml-auto font-mono text-[11px] text-zinc-400">
          {m.file} · {m.effort}
        </span>
      </summary>
      <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <Markdown text={m.persona} />
      </div>
    </details>
  );
}
