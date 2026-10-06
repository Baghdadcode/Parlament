// Choosing the AI model for a sitting: the options the picker shows, and applying the choice to the members.
import {
  CLAUDE_MODELS,
  GEMINI_FALLBACK_MODELS,
  MISTRAL_FALLBACK_MODELS,
  MODEL_ID_PATTERN,
  modelLabel,
  providerOf,
  type ProviderId,
} from "../config/models";
import type { MemberDef } from "./types";

export interface ProviderState {
  ok: boolean;
  /** No key configured (as opposed to a key that was rejected). */
  missing: boolean;
  error: string | null;
}

export interface ProviderStatus {
  fake: boolean;
  /** At least one provider can be used. */
  ok: boolean;
  providers: Record<ProviderId, ProviderState>;
  /** Gemini text models the key can use, newest first (null when unknown). */
  geminiModels: { id: string; label: string }[] | null;
  /** Mistral chat models the key can use, Large first (null when unknown). */
  mistralModels: { id: string; label: string }[] | null;
  /** Mistral plan: "free" (paced, $0) or "paid". */
  mistralTier: "free" | "paid";
}

export interface ModelOption {
  /** "" means: use the model each member file names. */
  value: string;
  label: string;
  available: boolean;
  /** Why it is unavailable, e.g. "GEMINI_API_KEY saknas". */
  note: string | null;
  /** Runs on Mistral's free tier, where requests are paced (slower sittings). */
  paced: boolean;
}

export interface ModelChoices {
  groups: { label: string; options: ModelOption[] }[];
  defaultValue: string;
}

const KEY_NAME: Record<ProviderId, string> = { anthropic: "ANTHROPIC_API_KEY", google: "GEMINI_API_KEY", mistral: "MISTRAL_API_KEY" };
const NAME: Record<ProviderId, string> = { anthropic: "Claude", google: "Gemini", mistral: "Mistral" };

function availability(status: ProviderStatus, providers: ProviderId[]): Pick<ModelOption, "available" | "note"> {
  for (const p of providers) {
    const s = status.providers[p];
    if (!s.ok) return { available: false, note: s.missing ? `${KEY_NAME[p]} saknas` : "nyckeln fungerar inte" };
  }
  return { available: true, note: null };
}

/** What the server has learned about the Mistral key's plan: models it refused, and what is used instead. */
export interface MistralPlanInfo {
  blocked: string[];
  substitutes: Record<string, string>;
}

/** "Mistral Large → Mistral Large 2512" once the plan forced a substitute. */
function planLabel(id: string, plan: MistralPlanInfo): string {
  let to = id;
  for (let i = 0; i < 10 && plan.substitutes[to]; i++) to = plan.substitutes[to]!;
  return to === id ? modelLabel(id) : `${modelLabel(id)} → ${modelLabel(to)}`;
}

/** The picker: the member files' own models, every Claude model, and the Gemini and Mistral models the keys can use. */
export function modelChoices(status: ProviderStatus, fileModels: string[], plan: MistralPlanInfo = { blocked: [], substitutes: {} }): ModelChoices {
  const free = status.mistralTier === "free";
  const uniqueFile = [...new Set(fileModels)];
  const fileProviders = [...new Set(uniqueFile.map(providerOf).filter((p) => p !== null))];
  const fromFiles: ModelOption = {
    value: "",
    label: `Enligt ledamotsfilerna (${uniqueFile.map((id) => planLabel(id, plan)).join(", ") || "standard"})`,
    ...availability(status, fileProviders),
    paced: free && fileProviders.includes("mistral"),
  };
  const claude = CLAUDE_MODELS.map((id) => ({ value: id, label: modelLabel(id), ...availability(status, ["anthropic"]), paced: false }));
  const geminiList = status.geminiModels?.length ? status.geminiModels : GEMINI_FALLBACK_MODELS.map((id) => ({ id, label: modelLabel(id) }));
  const gemini = geminiList.map((m) => ({ value: m.id, label: m.label, ...availability(status, ["google"]), paced: false }));
  const mistralList = status.mistralModels?.length ? status.mistralModels : MISTRAL_FALLBACK_MODELS.map((id) => ({ id, label: modelLabel(id) }));
  const mistral = mistralList.map((m) => {
    const label = plan.substitutes[m.id] ? planLabel(m.id, plan) : m.label;
    // Refused by the plan with nothing found to stand in: not selectable.
    const refused = plan.blocked.includes(m.id) && !plan.substitutes[m.id];
    return {
      value: m.id,
      label: `${label}${free ? " (gratis)" : ""}`,
      ...(refused ? { available: false, note: "ingår inte i din plan" } : availability(status, ["mistral"])),
      paced: free,
    };
  });
  const groups = [
    { label: "Ledamotsfilerna", options: [fromFiles] },
    { label: free ? "Mistral (gratisnivån)" : "Mistral", options: mistral },
    { label: "Claude (Anthropic)", options: claude },
    { label: "Gemini (Google)", options: gemini },
  ];
  const firstAvailable = groups.flatMap((g) => g.options).find((o) => o.available);
  return { groups, defaultValue: fromFiles.available ? "" : (firstAvailable?.value ?? "") };
}

export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** Puts every member (and the Speaker) on the chosen model; an empty choice keeps the files' own models. */
export function applyModel<T extends Pick<MemberDef, "model">>(members: T[], model: string | null | undefined): T[] {
  if (!model) return members;
  if (!MODEL_ID_PATTERN.test(model) || !providerOf(model)) throw new ModelUnavailableError(`Okänd modell "${model}".`);
  return members.map((m) => ({ ...m, model }));
}

/** Throws a readable error when a model in use needs a provider whose key is missing or rejected. */
export function assertUsable(status: ProviderStatus, models: string[]): void {
  for (const p of new Set(models.map(providerOf))) {
    if (!p) throw new ModelUnavailableError(`Okänd modell bland ${[...new Set(models)].join(", ")}.`);
    const s = status.providers[p];
    if (!s.ok) {
      throw new ModelUnavailableError(
        s.missing
          ? `${NAME[p]} kan inte användas: ${KEY_NAME[p]} saknas i .env.local.`
          : `${NAME[p]} kan inte användas: ${s.error ?? "nyckeln fungerar inte"}`,
      );
    }
  }
}
