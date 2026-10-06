import { describe, expect, it } from "vitest";
import { modelLabel, pricingFor, providerOf } from "../src/config/models";
import { applyModel, assertUsable, modelChoices, ModelUnavailableError, type ProviderStatus } from "../src/core/models";
import { computeCostUsd } from "../src/core/cost";
import { RouterProvider } from "../src/providers/router";
import { FakeProvider } from "../src/providers/fake";
import { runSession } from "../src/core/orchestrator";
import { loadMembers } from "../src/members/load";

const ok = { ok: true, missing: false, error: null };
const missing = { ok: false, missing: true, error: "saknas" };
const status = (over: Partial<ProviderStatus["providers"]> = {}, geminiModels: ProviderStatus["geminiModels"] = null): ProviderStatus => {
  const providers = { anthropic: ok, google: ok, ...over };
  return { fake: false, ok: providers.anthropic.ok || providers.google.ok, providers, geminiModels };
};

describe("model catalog", () => {
  it("knows which provider serves a model", () => {
    expect(providerOf("claude-opus-5-5")).toBe("anthropic");
    expect(providerOf("gemini-3.1-pro-preview")).toBe("google");
    expect(providerOf("gpt-5")).toBeNull();
  });
  it("prices unknown Gemini models like their family, and nothing else", () => {
    expect(pricingFor("gemini-3.1-pro-preview")?.inputPerMTok).toBe(2);
    expect(pricingFor("gemini-4-pro-preview")?.outputPerMTok).toBe(12);
    expect(pricingFor("gemini-4-flash")?.inputPerMTok).toBe(0.75);
    expect(pricingFor("gpt-5")).toBeNull();
    expect(computeCostUsd("gemini-3.8-flash", { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeCloseTo(4.5);
  });
  it("makes readable labels", () => {
    expect(modelLabel("claude-sonnet-5-5")).toBe("Claude Sonnet 5.5");
    expect(modelLabel("gemini-4-pro-preview")).toBe("Gemini 4 Pro Preview");
  });
});

describe("modelChoices", () => {
  it("offers the files' models, Claude and Gemini, defaulting to the files", () => {
    const c = modelChoices(status(), ["claude-opus-5-5"]);
    expect(c.groups.map((g) => g.label)).toEqual(["Ledamotsfilerna", "Claude (Anthropic)", "Gemini (Google)"]);
    expect(c.groups[0]!.options[0]).toMatchObject({ value: "", label: "Enligt ledamotsfilerna (Claude Opus 5.5)", available: true });
    expect(c.groups[2]!.options.map((o) => o.value)).toEqual(["gemini-3.1-pro-preview", "gemini-3.8-flash"]);
    expect(c.defaultValue).toBe("");
  });
  it("uses the Gemini models the key can see when known", () => {
    const c = modelChoices(status({}, [{ id: "gemini-4-pro", label: "Gemini 4 Pro" }]), ["claude-opus-5-5"]);
    expect(c.groups[2]!.options).toEqual([{ value: "gemini-4-pro", label: "Gemini 4 Pro", available: true, note: null }]);
  });
  it("greys out models without a key and defaults to one that works", () => {
    const c = modelChoices(status({ anthropic: missing }), ["claude-opus-5-5"]);
    expect(c.groups[0]!.options[0]).toMatchObject({ available: false, note: "ANTHROPIC_API_KEY saknas" });
    expect(c.groups[1]!.options.every((o) => !o.available)).toBe(true);
    expect(c.defaultValue).toBe("gemini-3.1-pro-preview");
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
    expect(() => assertUsable(status({ google: missing }), ["claude-opus-5-5", "gemini-3.8-flash"])).toThrow(/GEMINI_API_KEY saknas/);
    expect(() => assertUsable(status({ google: missing }), ["claude-opus-5-5"])).not.toThrow();
  });
  it("routes each member to the provider of its model, so a sitting can mix Claude and Gemini", async () => {
    const claude = new FakeProvider();
    const gemini = new FakeProvider();
    const mixed = members.map((m, i) => ({ ...m, model: i % 2 ? "gemini-3.8-flash" : "claude-opus-5-5" }));
    const r = await runSession(
      { question: "Q", members: mixed, talman: { ...talman, model: "gemini-3.1-pro-preview" }, mode: "full", rounds: 0 },
      new RouterProvider({ anthropic: () => claude, google: () => gemini }),
    );
    expect(r.state).toBe("done");
    expect(claude.seen.speak.map((s) => s.member.model)).toEqual(Array(4).fill("claude-opus-5-5"));
    expect(gemini.seen.speak).toHaveLength(4);
    expect(gemini.calls.synthesize).toBe(1);
    expect(new Set(r.usage.map((u) => u.model))).toEqual(new Set(["claude-opus-5-5", "gemini-3.8-flash", "gemini-3.1-pro-preview"]));
  });
});
