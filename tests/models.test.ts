import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, modelLabel, pricingFor, providerOf } from "../src/config/models";
import { applyModel, assertUsable, modelChoices, ModelUnavailableError, type ProviderStatus } from "../src/core/models";
import { billedPricing, computeCostUsd } from "../src/core/cost";
import { RouterProvider } from "../src/providers/router";
import { FakeProvider } from "../src/providers/fake";
import { runSession } from "../src/core/orchestrator";
import { loadMembers } from "../src/members/load";

const ok = { ok: true, missing: false, error: null };
const missing = { ok: false, missing: true, error: "saknas" };
const status = (over: Partial<ProviderStatus["providers"]> = {}, extra: Partial<ProviderStatus> = {}): ProviderStatus => {
  const providers = { anthropic: ok, google: ok, mistral: ok, ...over };
  return {
    fake: false,
    ok: Object.values(providers).some((p) => p.ok),
    providers,
    geminiModels: null,
    mistralModels: null,
    mistralTier: "free",
    ...extra,
  };
};

describe("model catalog", () => {
  it("knows which provider serves a model", () => {
    expect(providerOf("claude-opus-5-5")).toBe("anthropic");
    expect(providerOf("gemini-3.1-pro-preview")).toBe("google");
    expect(providerOf("mistral-large-latest")).toBe("mistral");
    expect(providerOf("ministral-8b-latest")).toBe("mistral");
    expect(providerOf("gpt-5")).toBeNull();
    expect(DEFAULT_MODEL).toBe("mistral-large-latest");
  });
  it("prices unknown Gemini and Mistral models like their family, and nothing else", () => {
    expect(pricingFor("gemini-3.1-pro-preview")?.inputPerMTok).toBe(2);
    expect(pricingFor("gemini-4-pro-preview")?.outputPerMTok).toBe(12);
    expect(pricingFor("gemini-4-flash")?.inputPerMTok).toBe(0.75);
    expect(pricingFor("mistral-large-2512")?.outputPerMTok).toBe(1.5);
    expect(pricingFor("mistral-medium-2604")?.inputPerMTok).toBe(1.5);
    expect(pricingFor("gpt-5")).toBeNull();
    expect(computeCostUsd("gemini-3.8-flash", { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(4.5);
  });
  it("bills Mistral at $0 on the free tier and at list price on the paid tier", () => {
    const counts = { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const before = process.env.MISTRAL_TIER;
    try {
      delete process.env.MISTRAL_TIER;
      expect(computeCostUsd("mistral-large-latest", counts)).toBe(0);
      process.env.MISTRAL_TIER = "paid";
      expect(computeCostUsd("mistral-large-latest", counts)).toBeCloseTo(2);
      expect(billedPricing("claude-opus-5-5")?.inputPerMTok).toBe(4);
    } finally {
      if (before === undefined) delete process.env.MISTRAL_TIER;
      else process.env.MISTRAL_TIER = before;
    }
  });
  it("makes readable labels", () => {
    expect(modelLabel("claude-sonnet-5-5")).toBe("Claude Sonnet 5.5");
    expect(modelLabel("gemini-4-pro-preview")).toBe("Gemini 4 Pro Preview");
    expect(modelLabel("mistral-large-latest")).toBe("Mistral Large");
    expect(modelLabel("ministral-8b-latest")).toBe("Ministral 8b");
  });
});

describe("modelChoices", () => {
  it("offers the files' models, then Mistral, Claude and Gemini, defaulting to the files", () => {
    const c = modelChoices(status(), ["mistral-large-latest"]);
    expect(c.groups.map((g) => g.label)).toEqual(["Ledamotsfilerna", "Mistral (gratisnivån)", "Claude (Anthropic)", "Gemini (Google)"]);
    expect(c.groups[0]!.options[0]).toMatchObject({ value: "", label: "Enligt ledamotsfilerna (Mistral Large)", available: true, paced: true });
    expect(c.groups[1]!.options.map((o) => o.label)).toEqual(["Mistral Large (gratis)", "Mistral Medium (gratis)", "Mistral Small (gratis)"]);
    expect(c.groups[2]!.options.every((o) => !o.paced)).toBe(true);
    expect(c.groups[3]!.options.map((o) => o.value)).toEqual(["gemini-3.1-pro-preview", "gemini-3.8-flash"]);
    expect(c.defaultValue).toBe("");
  });
  it("uses the models the keys can see when known, and drops the free marks on the paid tier", () => {
    const c = modelChoices(
      status({}, { geminiModels: [{ id: "gemini-4-pro", label: "Gemini 4 Pro" }], mistralModels: [{ id: "mistral-large-latest", label: "Mistral Large" }], mistralTier: "paid" }),
      ["mistral-large-latest"],
    );
    expect(c.groups[1]).toEqual({ label: "Mistral", options: [{ value: "mistral-large-latest", label: "Mistral Large", available: true, note: null, paced: false }] });
    expect(c.groups[3]!.options).toEqual([{ value: "gemini-4-pro", label: "Gemini 4 Pro", available: true, note: null, paced: false }]);
  });
  it("greys out models without a key and defaults to one that works", () => {
    const c = modelChoices(status({ mistral: missing }), ["mistral-large-latest"]);
    expect(c.groups[0]!.options[0]).toMatchObject({ available: false, note: "MISTRAL_API_KEY saknas" });
    expect(c.groups[1]!.options.every((o) => !o.available)).toBe(true);
    expect(c.defaultValue).toBe("claude-opus-5-5");
  });
});

describe("applyModel and assertUsable", () => {
  const { members, talman } = loadMembers("members");
  it("puts everyone on the chosen model, or keeps the files' models", () => {
    expect(applyModel(members, "gemini-3.8-flash").every((m) => m.model === "gemini-3.8-flash")).toBe(true);
    expect(applyModel(members, "")).toBe(members);
    expect(() => applyModel(members, "gpt-5")).toThrow(ModelUnavailableError);
  });
  it("refuses a model whose provider has no working key", () => {
    expect(() => assertUsable(status({ google: missing }), ["mistral-large-latest", "gemini-3.8-flash"])).toThrow(/GEMINI_API_KEY saknas/);
    expect(() => assertUsable(status({ mistral: missing }), ["mistral-large-latest"])).toThrow(/Mistral kan inte användas/);
    expect(() => assertUsable(status({ google: missing }), ["claude-opus-5-5"])).not.toThrow();
  });
  it("routes each member to the provider of its model, so a sitting can mix providers", async () => {
    const claude = new FakeProvider();
    const gemini = new FakeProvider();
    const mistral = new FakeProvider();
    const models = ["claude-opus-5-5", "gemini-3.8-flash", "mistral-large-latest", "mistral-small-latest"];
    const mixed = members.map((m, i) => ({ ...m, model: models[i % 4]! }));
    const r = await runSession(
      { question: "Q", members: mixed, talman: { ...talman, model: "mistral-large-latest" }, mode: "full", rounds: 0 },
      new RouterProvider({ anthropic: () => claude, google: () => gemini, mistral: () => mistral }),
    );
    expect(r.state).toBe("done");
    expect(claude.seen.speak).toHaveLength(2);
    expect(gemini.seen.speak.map((s) => s.member.model)).toEqual(["gemini-3.8-flash", "gemini-3.8-flash"]);
    expect(mistral.seen.speak).toHaveLength(4);
    expect(mistral.calls.synthesize).toBe(1);
  });
});
