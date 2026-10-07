import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DEFAULT_MODEL, EFFORTS, LIMITS, MODEL_ID_PATTERN } from "../config/models";
import { getMembersDir } from "../config/env";
import type { MemberDef } from "../core/types";

export class MemberFileError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = "MemberFileError";
  }
}

const bool = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  if (["true", "ja", "yes", "1"].includes(s)) return true;
  if (["false", "nej", "no", "0"].includes(s)) return false;
  return v;
}, z.boolean());

const frontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes"),
  name: z.string().min(1),
  party: z.string().min(1),
  short: z.string().min(1).max(5),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'use a hex colour like "#E8112D"'),
  role: z.enum(["ledamot", "talman"]).default("ledamot"),
  enabled: bool.default(true),
  order: z.coerce.number().default(50),
  /** Title on the name tag, e.g. "Partiordförande". */
  title: z.string().min(1).optional(),
  /** Riksdag seats: drawn in the chamber and used to weigh the main vote. */
  seats: z.coerce.number().int().min(0).max(349).default(0),
  /** Left-to-right place in the chamber diagram (defaults to order). */
  placement: z.coerce.number().optional(),
  /** How speakers address the Speaker: "Herr talman" or "Fru talman" (talman file only). */
  address: z.string().min(1).default("Herr talman"),
  model: z.string().regex(MODEL_ID_PATTERN, 'use a Claude or Gemini model ID, e.g. "claude-opus-5-5" or "gemini-3.1-pro-preview"').default(DEFAULT_MODEL),
  effort: z.enum(EFFORTS).default("medium"),
});

/** Minimal `key: value` frontmatter parser: quotes are stripped, and an unquoted value may end in a # comment. */
export function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (!m) throw new Error("missing frontmatter (the file must start with a --- block)");
  const data: Record<string, string> = {};
  for (const [i, raw] of m[1]!.split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`frontmatter line ${i + 1} is not "key: value": ${line}`);
    let value = kv[2]!.trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2]!;
    else value = value.replace(/\s+#.*$/, "").trim();
    data[kv[1]!] = value;
  }
  return { data, body: normalized.slice(m[0].length) };
}

const stripComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();

export function parseMemberFile(file: string, content: string): MemberDef {
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(content);
  } catch (err) {
    throw new MemberFileError(file, err instanceof Error ? err.message : String(err));
  }
  const fm = frontmatterSchema.safeParse(parsed.data);
  if (!fm.success) {
    const issues = fm.error.issues.map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`).join("; ");
    throw new MemberFileError(file, issues);
  }
  const persona = stripComments(parsed.body);
  if (!persona) throw new MemberFileError(file, "the persona (text below the frontmatter) is empty");
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const { title, placement, ...rest } = fm.data;
  return {
    ...rest,
    title: title ?? (fm.data.role === "talman" ? "Talman" : "Partiledare"),
    placement: placement ?? fm.data.order,
    persona,
    hash,
    file,
  };
}

/** Used when no talman file exists. */
export const DEFAULT_TALMAN: MemberDef = {
  id: "talman",
  name: "Talmannen",
  party: "Riksdagens talman",
  short: "TAL",
  color: "#6B7280",
  role: "talman",
  enabled: true,
  order: 99,
  title: "Talman",
  seats: 0,
  placement: 99,
  address: "Herr talman",
  persona:
    "Du är riksdagens talman: neutral, opartisk och noggrann. Du röstar inte. Du formulerar riksdagens beslut tydligt och redovisar oenighet öppet.",
  model: DEFAULT_MODEL,
  effort: "high",
  hash: "default",
  file: "(inbyggd)",
};

export interface LoadedMembers {
  /** Enabled debaters, in display order. */
  members: MemberDef[];
  talman: MemberDef;
  /** Every parsed file, including disabled ones. */
  all: MemberDef[];
  /** Your own members from members/egna/, for 1-mot-1 debates. */
  custom: MemberDef[];
  /** Files in members/egna/ that could not be used; they are skipped instead of stopping the app. */
  customErrors: { file: string; error: string }[];
}

/** The folder for your own members, inside the members folder. */
export const CUSTOM_DIR = "egna";

const customSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes").optional(),
  name: z.string().min(1),
  /** Party, movement or whatever the person stands for; optional. */
  party: z.string().min(1).default("Egen ledamot"),
  short: z.string().min(1).max(5).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'use a hex colour like "#7C3AED"').optional(),
  title: z.string().min(1).default("Gästtalare"),
  enabled: bool.default(true),
  order: z.coerce.number().default(100),
  model: z.string().regex(MODEL_ID_PATTERN, 'use a model ID such as "mistral-large-latest" or "claude-opus-5-5"').default(DEFAULT_MODEL),
  effort: z.enum(EFFORTS).default("medium"),
});

const CUSTOM_COLORS = ["#7C3AED", "#0F766E", "#B45309", "#BE185D", "#4338CA", "#15803D", "#9F1239", "#0369A1"];

/** "Astrid Lindgren" -> "astrid-lindgren"; Swedish letters lose their dots. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** "Astrid Lindgren" -> "AL" */
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3) || "?";

/**
 * A member file of your own. Only `name` and the persona are required: the id comes from the name, the short form
 * from the initials, and the colour from a fixed palette.
 */
export function parseCustomFile(file: string, content: string): MemberDef {
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(content);
  } catch (err) {
    throw new MemberFileError(file, err instanceof Error ? err.message : String(err));
  }
  const fm = customSchema.safeParse(parsed.data);
  if (!fm.success) {
    const issues = fm.error.issues.map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`).join("; ");
    throw new MemberFileError(file, issues);
  }
  const persona = stripComments(parsed.body);
  if (!persona) throw new MemberFileError(file, "the persona (text below the frontmatter) is empty");
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 12);
  const id = fm.data.id ?? slugify(fm.data.name);
  if (!id) throw new MemberFileError(file, "give the member an id (lowercase letters, digits and dashes)");
  const short = fm.data.short ?? initialsOf(fm.data.name);
  return {
    id,
    name: fm.data.name,
    party: fm.data.party,
    short,
    color: fm.data.color ?? CUSTOM_COLORS[parseInt(hash.slice(0, 6), 16) % CUSTOM_COLORS.length]!,
    role: "ledamot",
    enabled: fm.data.enabled,
    order: fm.data.order,
    title: fm.data.title,
    seats: 0,
    placement: fm.data.order,
    address: "Herr talman",
    persona,
    model: fm.data.model,
    effort: fm.data.effort,
    hash,
    file: `${CUSTOM_DIR}/${file}`,
    custom: true,
  };
}

/**
 * Reads members/egna/*.md. A broken file, or one whose id or short form is already taken, is reported and skipped,
 * so one bad file never stops the regular debate.
 */
export function loadCustomMembers(dir: string, taken: MemberDef[]): Pick<LoadedMembers, "custom" | "customErrors"> {
  const custom: MemberDef[] = [];
  const customErrors: LoadedMembers["customErrors"] = [];
  if (!existsSync(dir)) return { custom, customErrors };
  const ids = new Map(taken.map((m) => [m.id, m.file]));
  const shorts = new Map(taken.filter((m) => m.role === "ledamot").map((m) => [m.short.toLowerCase(), m.file]));
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();
  for (const f of files) {
    try {
      const m = parseCustomFile(f, readFileSync(join(dir, f), "utf8"));
      const idClash = ids.get(m.id);
      if (idClash) throw new MemberFileError(m.file, `id "${m.id}" is already used by ${idClash}`);
      const shortClash = shorts.get(m.short.toLowerCase());
      if (shortClash) throw new MemberFileError(m.file, `short "${m.short}" is already used by ${shortClash}; set another short:`);
      ids.set(m.id, m.file);
      shorts.set(m.short.toLowerCase(), m.file);
      if (m.enabled) custom.push(m);
    } catch (err) {
      customErrors.push({ file: `${CUSTOM_DIR}/${f}`, error: err instanceof Error ? err.message : String(err) });
    }
  }
  custom.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "sv"));
  return { custom, customErrors };
}

/**
 * Reads every *.md file (except README.md) in the members folder. Called at the start of every session, so edits
 * apply to the next question without restarting the server.
 */
export function loadMembers(dir: string = getMembersDir()): LoadedMembers {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md") && f.toLowerCase() !== "readme.md");
  } catch {
    throw new MemberFileError(dir, "the members folder does not exist");
  }
  const all = files.sort().map((f) => parseMemberFile(f, readFileSync(join(dir, f), "utf8")));
  const loaded = validateMembers(all);
  return { ...loaded, ...loadCustomMembers(join(dir, CUSTOM_DIR), all) };
}

export function validateMembers(all: MemberDef[]): LoadedMembers {
  const seen = new Map<string, string>();
  for (const m of all) {
    const prev = seen.get(m.id);
    if (prev) throw new MemberFileError(m.file, `id "${m.id}" is already used by ${prev}`);
    seen.set(m.id, m.file);
  }
  const talmen = all.filter((m) => m.role === "talman" && m.enabled);
  if (talmen.length > 1) throw new MemberFileError(talmen[1]!.file, "only one enabled member can have role: talman");
  const members = all
    .filter((m) => m.role === "ledamot" && m.enabled)
    .sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));
  const shorts = new Map<string, string>();
  for (const m of members) {
    const prev = shorts.get(m.short.toLowerCase());
    if (prev) throw new MemberFileError(m.file, `short "${m.short}" is already used by ${prev}`);
    shorts.set(m.short.toLowerCase(), m.file);
  }
  if (members.length < LIMITS.minMembers || members.length > LIMITS.maxMembers) {
    throw new MemberFileError(
      "members/",
      `a debate needs ${LIMITS.minMembers} to ${LIMITS.maxMembers} enabled members (role: ledamot), found ${members.length}`,
    );
  }
  return { members, talman: talmen[0] ?? DEFAULT_TALMAN, all, custom: [], customErrors: [] };
}

export const speakerName = (m: Pick<MemberDef, "name" | "short">) => `${m.name} (${m.short})`;
