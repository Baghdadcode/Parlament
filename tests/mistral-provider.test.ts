import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionError, MistralError } from "@mistralai/mistralai/models/errors";
import {
  MistralProvider,
  listMistralModels,
  mistralPacing,
  mistralPlan,
  readableMistralError,
  reasoningFor,
  resetMistralPlan,
  substituteFrom,
  type MistralClient,
} from "../src/providers/mistral";
import { Pacer } from "../src/providers/shared";
import { loadMembers } from "../src/members/load";
import type { SpeakRequest } from "../src/core/types";

type Params = Record<string, unknown>;

const { members, talman } = loadMembers("members");
const S = members.find((m) => m.id === "s")!;
const opening = (over: Partial<SpeakRequest> = {}): SpeakRequest => ({ member: S, question: "Q", round: 0, totalRounds: 2, transcript: [], ...over });

const event = (content: unknown, extra: { finishReason?: string; usage?: object } = {}) => ({
  data: { id: "x", model: "m", choices: [{ index: 0, delta: { content }, finishReason: extra.finishReason ?? null }], ...(extra.usage ? { usage: extra.usage } : {}) },
});
const reply = (text = "## Förslag\nok", finishReason = "stop") => [
  event(text.slice(0, 5)),
  event(text.slice(5), { finishReason, usage: { promptTokens: 3000, completionTokens: 800, totalTokens: 3800 } }),
];

/** A stream that sends nothing until the request is aborted, like a stalled connection. */
const STALL = Symbol("stall");

/** Minimal stand-in for the SDK client: records request params, replays scripted streams. */
function fakeMistral(script: (() => unknown[] | typeof STALL)[] = [], models: unknown[] = []) {
  const requests: Params[] = [];
  const client = {
    chat: {
      stream: async (params: Params, options?: { fetchOptions?: { signal?: AbortSignal } }) => {
        requests.push(params);
        const events = (script.shift() ?? (() => reply()))();
        const signal = options?.fetchOptions?.signal;
        return (async function* () {
          if (events === STALL) {
            await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
            return;
          }
          for (const e of events) yield e;
        })();
      },
    },
    models: { list: async () => ({ object: "list", data: models }) },
  } as unknown as MistralClient;
  return { client, requests };
}

/** A real SDK error with a status code and headers, as the client throws it. */
function httpError(status: number, body = "error", headers: Record<string, string> = {}) {
  const response = new Response(body, { status, headers });
  return new MistralError(body, { response, request: new Request("https://api.mistral.ai/v1/chat/completions"), body });
}

const fast = { backoffBaseMs: 0, minIntervalMs: 0 };

describe("MistralProvider request shape", () => {
  it("sends one system message (shared blocks first, then the persona), the member's model and reasoning effort", async () => {
    const { client, requests } = fakeMistral();
    const deltas: string[] = [];
    const transcript = [{ round: 0, memberId: "m", speaker: "Ulf Kristersson (M)", text: "## Förslag\nKärnkraft." }];
    const r = await new MistralProvider({ client, ...fast }).speak(opening({ round: 1, transcript, brief: "BAKGRUNDEN", onText: (d) => deltas.push(d) }));
    const req = requests[0]!;
    expect(req.model).toBe("mistral-large-latest");
    const [system, user] = req.messages as { role: string; content: string }[];
    expect(system!.role).toBe("system");
    expect(system!.content.indexOf("BAKGRUNDEN")).toBeLessThan(system!.content.indexOf("<inlägg"));
    expect(system!.content.indexOf("<inlägg")).toBeLessThan(system!.content.indexOf("Du spelar Magdalena Andersson"));
    expect(user).toEqual({ role: "user", content: expect.stringContaining("Fråga till riksdagen") });
    expect(req.reasoningEffort).toBe("medium");
    expect(req).not.toHaveProperty("temperature");
    expect(r.value).toBe("## Förslag\nok");
    expect(deltas.join("")).toBe("## Förslag\nok");
  });

  it("leaves a reasoning model's thinking out of the answer, and reports that it is thinking", async () => {
    const { client } = fakeMistral([
      () => [
        event([{ type: "thinking", thinking: [{ type: "text", text: "hmm" }] }]),
        event([{ type: "thinking", thinking: [{ type: "text", text: "mer" }] }]),
        event([{ type: "text", text: "Svar." }], { finishReason: "stop" }),
      ],
    ]);
    const statuses: string[] = [];
    const r = await new MistralProvider({ client, ...fast }).speak(opening({ onStatus: (s) => statuses.push(s.kind) }));
    expect(r.value).toBe("Svar.");
    expect(statuses).toEqual(["queued", "started", "thinking"]);
  });

  it("asks for strict JSON-schema output for the votes", async () => {
    const { client, requests } = fakeMistral([() => reply(JSON.stringify({ vote: "nej", explanation: "Nej." }))]);
    const out = await new MistralProvider({ client, ...fast }).vote({ member: S, question: "Q", decision: "X", ownProposal: "Y" });
    expect(out.value).toEqual({ choice: "nej", explanation: "Nej." });
    expect(requests[0]!.responseFormat).toMatchObject({ type: "json_schema", jsonSchema: { name: "votering", strict: true } });
  });

  it("maps effort to Mistral's reasoning effort", () => {
    expect(reasoningFor("low")).toBe("low");
    expect(reasoningFor("max")).toBe("xhigh");
  });

  it("records usage; Mistral on the free tier costs nothing", async () => {
    const { client } = fakeMistral();
    const r = await new MistralProvider({ client, ...fast }).synthesize({ talman, question: "Q", mode: "chairman", answers: [], reviews: [] });
    expect(r.usage[0]).toMatchObject({ stage: "synthesize", advisorId: "talman", inputTokens: 3000, outputTokens: 800, model: "mistral-large-latest", costUsd: 0 });
  });
});

describe("MistralProvider error handling and pacing", () => {
  it("retries 429 (honouring Retry-After), 5xx and connection errors, but not other client errors", async () => {
    const flaky = fakeMistral([
      () => {
        throw httpError(429, "rate limited", { "retry-after": "0" });
      },
      () => {
        throw httpError(503);
      },
      () => {
        throw new ConnectionError("reset");
      },
    ]);
    const r = await new MistralProvider({ client: flaky.client, ...fast }).speak(opening());
    expect(flaky.requests).toHaveLength(4);
    expect(r.value).toContain("Förslag");

    const bad = fakeMistral([
      () => {
        throw httpError(404, "Invalid model");
      },
    ]);
    await expect(new MistralProvider({ client: bad.client, ...fast }).speak(opening())).rejects.toThrow("Mistral (404): Invalid model");
    expect(bad.requests).toHaveLength(1);
  });

  it("slows down after a rate limit: one request at a time, a longer gap, and a retry notice", async () => {
    const { client } = fakeMistral([
      () => {
        throw httpError(429, "rate limited", { "retry-after": "0" });
      },
    ]);
    const p = new MistralProvider({ client, ...fast, maxConcurrent: 3 });
    const statuses: { kind: string; reason?: string }[] = [];
    await p.speak(opening({ onStatus: (s) => statuses.push(s) }));
    const internals = p as unknown as { gate: { limit: number }; pacer: { interval: number } };
    expect(internals.gate.limit).toBe(1);
    expect(internals.pacer.interval).toBeGreaterThanOrEqual(1500); // slowed to 2 s, eased once after the success
    expect(statuses).toContainEqual(expect.objectContaining({ kind: "retrying", reason: "för många förfrågningar (rate limit)" }));
  });

  it("aborts and retries a stream that goes silent", async () => {
    const { client, requests } = fakeMistral([() => STALL]);
    const r = await new MistralProvider({ client, ...fast, stallTimeoutMs: 30 }).speak(opening());
    expect(requests).toHaveLength(2);
    expect(r.value).toContain("Förslag");
  });

  it("drops the reasoning setting for a model that rejects it", async () => {
    const { client, requests } = fakeMistral([
      () => {
        throw httpError(400, '{"message":"reasoning_effort is not supported for this model"}');
      },
    ]);
    const p = new MistralProvider({ client, ...fast });
    await p.speak(opening());
    await p.speak(opening());
    expect(requests.map((r) => "reasoningEffort" in r)).toEqual([true, false, false]);
  });

  it("raises the output limit and retries when the answer is cut off", async () => {
    const { client, requests } = fakeMistral([() => reply("## Förslag\nhalv", "length"), () => reply()]);
    const r = await new MistralProvider({ client, ...fast }).speak(opening());
    expect(requests.map((x) => x.maxTokens)).toEqual([16_000, 32_000]);
    expect(r.usage).toHaveLength(2);
  });

  it("paces request starts on the free tier", async () => {
    const pacer = new Pacer(40);
    const started: number[] = [];
    const t0 = Date.now();
    await Promise.all([0, 1, 2].map(async () => {
      await pacer.wait();
      started.push(Date.now() - t0);
    }));
    expect(started.sort((a, b) => a - b)[2]!).toBeGreaterThanOrEqual(75);
  });

  it("defaults to about one request per second on the free tier and full speed when paid", () => {
    const before = process.env.MISTRAL_TIER;
    try {
      delete process.env.MISTRAL_TIER;
      expect(mistralPacing()).toMatchObject({ minIntervalMs: 1100, maxAttempts: 8 });
      process.env.MISTRAL_TIER = "paid";
      expect(mistralPacing()).toMatchObject({ minIntervalMs: 0, maxConcurrent: 5 });
    } finally {
      if (before === undefined) delete process.env.MISTRAL_TIER;
      else process.env.MISTRAL_TIER = before;
    }
  });
});

describe("listMistralModels", () => {
  it("keeps the -latest chat models, Large first", async () => {
    const card = (id: string, completionChat = true) => ({ id, object: "model", type: "base", capabilities: { completionChat } });
    const { client } = fakeMistral(
      [],
      [
        card("mistral-small-latest"),
        card("mistral-large-2512"),
        card("mistral-large-latest"),
        card("codestral-latest"),
        card("mistral-embed", false),
        card("mistral-ocr-latest"),
        card("mistral-medium-latest"),
        { ...card("magistral-small-latest"), deprecation: new Date("2026-11-30") },
      ],
    );
    expect(await listMistralModels(client)).toEqual([
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-medium-latest", label: "Mistral Medium" },
      { id: "mistral-small-latest", label: "Mistral Small" },
    ]);
  });

  it("turns a rejected key into a readable error", async () => {
    const client = {
      models: {
        list: async () => {
          throw httpError(401, "Unauthorized");
        },
      },
    } as unknown as MistralClient;
    await expect(listMistralModels(client)).rejects.toThrow(/Mistral avvisade nyckeln/);
  });
});

describe("models outside the key's plan", () => {
  beforeEach(() => resetMistralPlan());

  const notInPlan = () =>
    httpError(
      403,
      JSON.stringify({ object: "error", message: "This model is not available in your subscription tier", type: "tier_not_allowed", code: "1910" }),
    );

  /** Refuses mistral-large-latest like the free plan does; answers every other model. */
  function planClient() {
    const models: string[] = [];
    const card = (id: string) => ({ id, object: "model", type: "base", capabilities: { completionChat: true } });
    const client = {
      chat: {
        stream: async (params: Params) => {
          models.push(params.model as string);
          if (params.model === "mistral-large-latest") throw notInPlan();
          return (async function* () {
            for (const e of reply()) yield e;
          })();
        },
      },
      models: { list: async () => ({ object: "list", data: ["mistral-large-latest", "mistral-large-2512", "mistral-medium-latest", "mistral-small-latest"].map(card) }) },
    } as unknown as MistralClient;
    return { client, models };
  }

  it("switches to the nearest model the plan includes, says so, and remembers it", async () => {
    const { client, models } = planClient();
    const p = new MistralProvider({ client, ...fast });
    const statuses: unknown[] = [];
    const r = await p.speak(opening({ onStatus: (s) => statuses.push(s) }));
    expect(r.value).toContain("Förslag");
    expect(models).toEqual(["mistral-large-latest", "mistral-large-2512"]);
    expect(r.usage[0]).toMatchObject({ model: "mistral-large-2512", fellBack: true });
    expect(statuses).toContainEqual({ kind: "fallback", from: "mistral-large-latest", to: "mistral-large-2512" });
    expect(mistralPlan()).toEqual({ blocked: ["mistral-large-latest"], substitutes: { "mistral-large-latest": "mistral-large-2512" } });

    // Later calls, even from another provider instance, go straight to the substitute.
    await new MistralProvider({ client, ...fast }).vote({ member: S, question: "Q", decision: "X", ownProposal: "Y" }).catch(() => undefined);
    expect(models.slice(2)).toEqual(["mistral-large-2512"]);
  });

  it("picks older versions of the same family first, then smaller families", () => {
    const all = ["mistral-large-latest", "mistral-large-2512", "mistral-large-2411", "mistral-medium-latest", "mistral-small-latest"];
    expect(substituteFrom("mistral-large-latest", all)).toBe("mistral-large-2512");
    expect(substituteFrom("mistral-medium-latest", all)).toBe("mistral-small-latest");
    expect(substituteFrom("mistral-small-latest", ["mistral-small-latest"])).toBeNull();
    expect(substituteFrom("mistral-large-latest", [])).toBe("mistral-medium-latest"); // the built-in fallbacks
  });

  it("turns Mistral's JSON error body into a readable message", () => {
    expect(readableMistralError(notInPlan()).message).toBe("Mistral (403): This model is not available in your subscription tier");
  });
});
