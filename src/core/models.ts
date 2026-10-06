// Choosing the AI model for a sitting: the options the picker shows, and applying the choice to the members.
import { CLAUDE_MODELS, GEMINI_FALLBACK_MODELS, MODEL_ID_PATTERN, modelLabel, providerOf, type ProviderId } from "../config/models";
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
}

export interface ModelOption {
  /** "" means: use the model each member file names. */
  value: string;
  label: string;
  available: boolean;
  /** Why it is unavailable, e.g. "GEMINI_API_KEY saknas". */
  note: string | null;
}

export interface ModelChoices {
  groups: { label: string; options: ModelOption[] }[];
  defaultValue: string;
}

const KEY_NAME: Record<ProviderId, string> = { anthropic: "ANTHROPIC_API_KEY", google: "GEMINI_API_KEY" };

function availability(status: ProviderStatus, providers: ProviderId[]): Pick<ModelOption, "available" | "note"> {
  for (const p of providers) {
    const s = status.providers[p];
    if (!s.ok) return { available: false, note: s.missing ? `${KEY_NAME[p]} saknas` : "nyckeln fungerar inte" };
  }
  return { available: true, note: null };
}

/** The picker: the member files' own models, every Claude model, and the Gemini models the key can use. */
export function modelChoices(status: ProviderStatus, fileModels: string[]): ModelChoices {
  const uniqueFile = [...new Set(fileModels)];
  const fileProviders = [...new Set(uniqueFile.map(providerOf).filter((p) => p !== null))];
  const fromFiles: ModelOption = {
    value: "",
    label: `Enligt ledamotsfilerna (${uniqueFile.map(modelLabel).join(", ") || "standard"})`,
    ...availability(status, fileProviders),
  };
  const claude = CLAUDE_MODELS.map((id) => ({ value: id, label: modelLabel(id), ...availability(status, ["anthropic"]) }));
  const geminiList = status.geminiModels?.length ? status.geminiModels : GEMINI_FALLBACK_MODELS.map((id) => ({ id, label: modelLabel(id) }));
  const gemini = geminiList.map((m) => ({ value: m.id, label: m.label, ...availability(status, ["google"]) }));
  const groups = [
    { label: "Ledamotsfilerna", options: [fromFiles] },
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
          ? `${p === "google" ? "Gemini" : "Claude"} kan inte användas: ${KEY_NAME[p]} saknas i .env.local.`
          : `${p === "google" ? "Gemini" : "Claude"} kan inte användas: ${s.error ?? "nyckeln fungerar inte"}`,
      );
    }
  }
}
