import { ApiError, ThinkingLevel } from "@google/genai";
import { describe, expect, it } from "vitest";
import { GeminiProvider, compareGemini, listGeminiModels, thinkingFor, type GeminiClient } from "../src/providers/gemini";
import { RefusalError } from "../src/providers/shared";
import { loadMembers } from "../src/members/load";
import type { SpeakRequest } from "../src/core/types";

type Params = Record<string, unknown> & { config: Record<string, unknown> };

const { members, talman } = loadMembers("members");
const S = { ...members.find((m) => m.id === "s")!, model: "gemini-3.1-pro-preview" };
const opening = (over: Partial<SpeakRequest> = {}): SpeakRequest => ({ member: S, question: "Q", round: 0, totalRounds: 2, transcript: [], ...over });

const usage = { promptTokenCount: 3000, cachedContentTokenCount: 2000, candidatesTokenCount: 400, thoughtsTokenCount: 600 };
const chunk = (text: string, extra: Record<string, unknown> = {}) => ({ candidates: [{ content: { parts: [{ text }] }, ...extra }] });
const reply = (text = "## Förslag\nok", finishReason = "STOP") => [chunk(text.slice(0, 5)), { ...chunk(text.slice(5), { finishReason }), usageMetadata: usage }];

/** Minimal stand-in for the SDK client: records request params, replays scripted streams. */
function fakeGemini(script: (() => unknown[])[] = [], models: unknown[] = []) {
  const requests: Params[] = [];
  const client = {
    models: {
      generateContentStream: async (params: Params) => {
        requests.push(params);
        const chunks = (script.shift() ?? (() => reply()))();
        return (async function* () {
          for (const c of chunks) yield c;
        })();
      },
      list: async () =>
        (async function* () {
          for (const m of models) yield m;
        })(),
    },
  } as unknown as GeminiClient;
  return { client, requests };
}

const apiError = (status: number, message = "error") => new ApiError({ status, message });

describe("GeminiProvider request shape", () => {
  it("sends the shared blocks first in the system instruction, then the persona, and streams the answer", async () => {
    const { client, requests } = fakeGemini();
    const deltas: string[] = [];
    const transcript = [{ round: 0, memberId: "m", speaker: "Ulf Kristersson (M)", text: "## Förslag\nKärnkraft." }];
    const r = await new GeminiProvider({ client }).speak(opening({ round: 1, transcript, brief: "BAKGRUNDEN", onText: (d) => deltas.push(d) }));
    const req = requests[0]!;
    expect(req.model).toBe("gemini-3.1-pro-preview");
    const parts = (req.config.systemInstruction as { parts: { text: string }[] }).parts;
    expect(parts).toHaveLength(3);
    expect(parts[0]!.text).toContain("BAKGRUNDEN");
    expect(parts[1]!.text).toContain('<inlägg talare="Ulf Kristersson (M)">');
    expect(parts[2]!.text).toContain("Du spelar Magdalena Andersson");
    expect(req.contents).toEqual([{ role: "user", parts: [{ text: expect.stringContaining("Fråga till riksdagen") }] }]);
    expect(req.config).not.toHaveProperty("temperature");
    expect(req.config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.MEDIUM });
    expect(r.value).toBe("## Förslag\nok");
    expect(deltas.join("")).toBe("## Förslag\nok");
  });

  it("leaves the model's thoughts out of the answer", async () => {
    const { client } = fakeGemini([
      () => [{ candidates: [{ content: { parts: [{ text: "tänker…", thought: true }, { text: "Svar." }] }, finishReason: "STOP" }], usageMetadata: usage }],
    ]);
    expect((await new GeminiProvider({ client }).speak(opening())).value).toBe("Svar.");
  });

  it("asks for JSON with a JSON schema (without additionalProperties) for the vote", async () => {
    const { client, requests } = fakeGemini([() => reply(JSON.stringify({ vote: "ja", explanation: "Bra." }))]);
    const out = await new GeminiProvider({ client }).vote({ member: S, question: "Q", decision: "X", ownProposal: "Y" });
    expect(out.value).toEqual({ choice: "ja", explanation: "Bra." });
    expect(requests[0]!.config.responseMimeType).toBe("application/json");
    expect(JSON.stringify(requests[0]!.config.responseJsonSchema)).not.toContain("additionalProperties");
    expect(JSON.stringify(requests[0]!.config.responseJsonSchema)).toContain('"enum":["ja","nej","avstar"]');
  });

  it("parses a ranking even when wrapped in a code fence", async () => {
    const ranking = { ranking: [{ label: "A", rank: 1, correctness: 4, reasoning_quality: 4, usefulness: 4, risks_covered: 4, reasoning: "x" }] };
    const { client } = fakeGemini([() => reply("```json\n" + JSON.stringify(ranking) + "\n```")]);
    const out = await new GeminiProvider({ client }).rank({ reviewer: S, question: "Q", answers: [{ label: "A", text: "a" }] });
    expect(out.value.items.map((i) => i.label)).toEqual(["A"]);
  });

  it("uses the Speaker's high effort for the decision", async () => {
    const { client, requests } = fakeGemini();
    await new GeminiProvider({ client }).synthesize({ talman: { ...talman, model: "gemini-3.8-flash" }, question: "Q", mode: "chairman", answers: [], reviews: [] });
    expect(requests[0]!.config.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.HIGH });
  });

  it("bills cached input at the cache price and thinking as output", async () => {
    const { client } = fakeGemini();
    const r = await new GeminiProvider({ client }).speak(opening());
    expect(r.usage[0]).toMatchObject({ inputTokens: 1000, cacheReadTokens: 2000, outputTokens: 1000, model: "gemini-3.1-pro-preview", stage: "opening", stopReason: "stop" });
    expect(r.usage[0]!.costUsd).toBeCloseTo((1000 * 2 + 2000 * 0.2 + 1000 * 12) / 1e6);
  });
});

describe("thinkingFor", () => {
  it("maps effort to Gemini 3 thinking levels, and gives Gemini 2.x a dynamic budget", () => {
    expect(thinkingFor("gemini-3.8-flash", "low")).toEqual({ thinkingLevel: ThinkingLevel.LOW });
    expect(thinkingFor("gemini-3.8-flash", "max")).toEqual({ thinkingLevel: ThinkingLevel.HIGH });
    expect(thinkingFor("gemini-2.5-pro", "medium")).toEqual({ thinkingBudget: -1 });
  });
});

describe("GeminiProvider error handling", () => {
  it("throws RefusalError when the prompt or the answer is blocked", async () => {
    const blocked = fakeGemini([() => [{ promptFeedback: { blockReason: "SAFETY" }, usageMetadata: usage }]]);
    await expect(new GeminiProvider({ client: blocked.client }).speak(opening())).rejects.toBeInstanceOf(RefusalError);
    const stopped = fakeGemini([() => reply("", "PROHIBITED_CONTENT")]);
    await expect(new GeminiProvider({ client: stopped.client }).speak(opening())).rejects.toBeInstanceOf(RefusalError);
  });

  it("retries 429 and 5xx with backoff, but not other client errors", async () => {
    const flaky = fakeGemini([
      () => {
        throw apiError(429);
      },
      () => {
        throw apiError(503);
      },
    ]);
    const r = await new GeminiProvider({ client: flaky.client, backoffBaseMs: 0 }).speak(opening());
    expect(flaky.requests).toHaveLength(3);
    expect(r.value).toContain("Förslag");

    const bad = fakeGemini([
      () => {
        throw apiError(404, "model not found");
      },
    ]);
    await expect(new GeminiProvider({ client: bad.client, backoffBaseMs: 0 }).speak(opening())).rejects.toThrow("model not found");
    expect(bad.requests).toHaveLength(1);
  });

  it("drops the thinking setting when a model rejects it", async () => {
    const { client, requests } = fakeGemini([
      () => {
        throw apiError(400, "thinking_level is not supported for this model");
      },
    ]);
    const p = new GeminiProvider({ client, backoffBaseMs: 0 });
    await p.speak(opening());
    await p.speak(opening());
    expect(requests.map((r) => "thinkingConfig" in r.config)).toEqual([true, false, false]);
  });

  it("raises the output limit and retries when the answer is cut off", async () => {
    const { client, requests } = fakeGemini([() => reply("## Förslag\nhalv", "MAX_TOKENS"), () => reply()]);
    const r = await new GeminiProvider({ client }).speak(opening());
    expect(requests.map((x) => x.config.maxOutputTokens)).toEqual([16_000, 32_000]);
    expect(r.usage).toHaveLength(2);
  });
});

describe("listGeminiModels", () => {
  it("keeps the text models that can generate content, newest and strongest first", async () => {
    const { client } = fakeGemini(
      [],
      [
        { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedActions: ["generateContent"] },
        { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedActions: ["generateContent"] },
        { name: "models/gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", supportedActions: ["generateContent"] },
        { name: "models/gemini-3.1-flash-image", displayName: "Image", supportedActions: ["generateContent"] },
        { name: "models/gemini-embedding-001", displayName: "Embedding", supportedActions: ["embedContent"] },
        { name: "models/gemini-3.1-flash-live-preview", displayName: "Live", supportedActions: ["bidiGenerateContent"] },
        { name: "models/imagen-4", displayName: "Imagen", supportedActions: ["predict"] },
      ],
    );
    expect((await listGeminiModels(client)).map((m) => m.id)).toEqual(["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-2.5-flash"]);
  });

  it("turns a rejected key into a readable error", async () => {
    const client = {
      models: {
        list: async () => {
          throw apiError(400, "API key not valid");
        },
      },
    } as unknown as GeminiClient;
    await expect(listGeminiModels(client)).rejects.toThrow(/avvisade Gemini-nyckeln/);
  });

  it("orders Pro before Flash within a version", () => {
    const ids = ["gemini-3.1-flash-lite", "gemini-3.1-flash", "gemini-3.1-pro-preview"].map((id) => ({ id, label: id }));
    expect(ids.sort(compareGemini).map((m) => m.id)).toEqual(["gemini-3.1-pro-preview", "gemini-3.1-flash", "gemini-3.1-flash-lite"]);
  });
});
