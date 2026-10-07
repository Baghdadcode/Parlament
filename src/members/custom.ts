// Your own members (members/egna/*.md): read, write and delete the files from the browser. Server only.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getMembersDir } from "../config/env";
import { CUSTOM_DIR, loadMembers, parseCustomFile } from "./load";

export interface CustomFile {
  /** File name inside members/egna/, e.g. "astrid-lindgren.md". */
  file: string;
  content: string;
}

const FILE_NAME = /^[a-z0-9-]+\.md$/;

export const customDir = (membersDir = getMembersDir()) => join(membersDir, CUSTOM_DIR);

export function listCustomFiles(membersDir?: string): CustomFile[] {
  const dir = customDir(membersDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort()
    .map((file) => ({ file, content: readFileSync(join(dir, file), "utf8") }));
}

/**
 * Checks a member file and saves it as members/egna/<id>.md. When `previous` is given (editing), that file is
 * replaced, and removed if the id changed. Throws a readable error when the file is invalid or clashes.
 */
export function saveCustomFile(content: string, previous?: string | null, membersDir = getMembersDir()): CustomFile {
  if (previous && !FILE_NAME.test(previous)) throw new Error("Ogiltigt filnamn.");
  const draft = parseCustomFile(previous ?? "ny-ledamot.md", content);
  const file = `${draft.id}.md`;
  if (!FILE_NAME.test(file)) throw new Error("id får bara innehålla små bokstäver, siffror och bindestreck.");

  const dir = customDir(membersDir);
  const loaded = loadMembers(membersDir);
  const others = [...loaded.all, ...loaded.custom].filter((m) => !(m.custom && (m.file === `${CUSTOM_DIR}/${previous}` || m.file === `${CUSTOM_DIR}/${file}`)));
  const sameId = others.find((m) => m.id === draft.id);
  if (sameId) throw new Error(`id "${draft.id}" används redan av ${sameId.name} (${sameId.file}).`);
  if (file !== previous && existsSync(join(dir, file))) throw new Error(`Det finns redan en fil ${CUSTOM_DIR}/${file}.`);
  const sameShort = others.find((m) => m.role === "ledamot" && m.short.toLowerCase() === draft.short.toLowerCase());
  if (sameShort) throw new Error(`Förkortningen "${draft.short}" används redan av ${sameShort.name}; ange en annan med short:.`);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), content.endsWith("\n") ? content : `${content}\n`, "utf8");
  if (previous && previous !== file && existsSync(join(dir, previous))) unlinkSync(join(dir, previous));
  return { file, content };
}

export function deleteCustomFile(file: string, membersDir?: string): void {
  if (!FILE_NAME.test(file)) throw new Error("Ogiltigt filnamn.");
  const path = join(customDir(membersDir), file);
  if (existsSync(path)) unlinkSync(path);
}

/** A starting point for a new member; every field but name is optional. */
export function customTemplate(name = "Ditt namn"): string {
  return `---
name: ${name}
title: Gästtalare          # valfritt: titel på namnskylten, t.ex. Författare eller Statsminister 1969–1976
party: Partilös            # valfritt: parti, rörelse eller vad personen står för
# short: AB                # valfritt: förkortning (annars initialerna)
# color: "#7C3AED"         # valfritt: färg i gränssnittet
# model: mistral-large-latest
# effort: medium
---
<!-- Allt under frontmatter (utom kommentarer som denna) blir personans beskrivning, ordagrant. -->

## Vem du är
Vem personen är, när och var hen levde, och vad hen är känd för.

## Åsikter och värderingar
Vad personen tycker och varför. Vilka frågor brinner hen för?

## Debattstil
Hur personen talar: tonläge, humor, typiska formuleringar, hur hen bemöter motståndare.

## Röda linjer
Vad personen aldrig skulle gå med på.
`;
}
