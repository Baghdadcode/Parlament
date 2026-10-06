import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeProvider, RefusalError, Semaphore } from "../src/providers/claude";
import { loadMembers } from "../src/members/load";
import type { SpeakRequest } from "../src/core/types";

type Params = Record<string, unknown>;

const { members, talman } = loadMembers("members");
const S = members.find((m) => m.id === "s")!;
const opening = (over: Partial<SpeakRequest> = {}): SpeakRequest => ({ member: S, question: "Q", round: 0, totalRounds: 2, transcript: [], ...over });

function message(over: Record<string, unknown> = {}) {
  return {
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    stop_details: null,
    content: [{ type: "text", text: "## Förslag\nok" }],
    usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
    ...over,
  };
}

/** Minimal stand-in for the SDK client: records request params, replays scripted outcomes. */
function fakeClient(script: (() => unknown)[]) {
  const requests: Params[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Params) => {
          requests.push(params);
          const next = script.shift() ?? (() => message());
          return { on: () => undefined, finalMessage: async () => next() };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const rateLimit = () => new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());
type SystemBlock = { text: string; cache_control?: unknown };

describe("ClaudeProvider request shape", () => {
  it("uses adaptive thinking, the member's effort, a cached brief first, and never sends temperature or tool_choice", async () => {
    const { client, requests } = fakeClient([]);
    await new ClaudeProvider({ client, backoffBaseMs: 0 }).speak(opening({ brief: "BAKGRUNDEN" }));
    const r = requests[0]!;
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.thinking).toEqual({ type: "adaptive" });
    expect((r.output_config as { effort: string }).effort).toBe("medium");
    expect(r).not.toHaveProperty("temperature");
    expect(r).not.toHaveProperty("tool_choice");
    expect(r.fallbacks).toBe("default");
    expect(r.betas).toContain("server-side-fallback-2026-07-01");
    const system = r.system as SystemBlock[];
    expect(system).toHaveLength(2);
    expect(system[0]!.text).toContain("BAKGRUNDEN");
    expect(system[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[1]!.text).toContain("Du spelar Magdalena Andersson");
    expect(system[1]!.text).toContain('"Herr talman!"');
    expect(system[1]!.text).toContain("öppningsanförande");
    expect(system[1]).not.toHaveProperty("cache_control");
  });

  it("puts the debate transcript in a second cached block in rebuttal rounds, identical for every member", async () => {
    const { client, requests } = fakeClient([]);
    const p = new ClaudeProvider({ client });
    const transcript = [{ round: 0, memberId: "m", speaker: "Ulf Kristersson (M)", text: "## Förslag\nKärnkraft." }];
    await p.speak(opening({ round: 1, transcript, brief: "B" }));
    await p.speak(opening({ member: members[1]!, round: 1, transcript, brief: "B" }));
    const [a, b] = requests.map((r) => r.system as SystemBlock[]);
    expect(a).toHaveLength(3);
    expect(a![1]!.text).toContain('<inlägg talare="Ulf Kristersson (M)">');
    expect(a![1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(a![1]!.text).toBe(b![1]!.text);
    expect(a![2]!.text).toContain("replikskifte 1 av 2");
    expect(a![2]!.text).not.toBe(b![2]!.text);
  });

  it("omits the brief block when there is none and tells the last round its proposal goes to the vote", async () => {
    const { client, requests } = fakeClient([]);
    await new ClaudeProvider({ client }).speak(opening({ round: 2, transcript: [{ round: 0, memberId: "m", speaker: "X (M)", text: "t" }] }));
    const system = requests[0]!.system as SystemBlock[];
    expect(system).toHaveLength(2);
    expect(system[1]!.text).toContain("sista rundan");
  });

  it("requests structured JSON output for the vote and validates it", async () => {
    const ranking = {
      ranking: [
        { label: "A", rank: 1, correctness: 4, reasoning_quality: 4, usefulness: 4, risks_covered: 4, reasoning: "x" },
        { label: "B", rank: 2, correctness: 3, reasoning_quality: 3, usefulness: 3, risks_covered: 3, reasoning: "y" },
      ],
    };
    const { client, requests } = fakeClient([() => message({ content: [{ type: "text", text: JSON.stringify(ranking) }] })]);
    const out = await new ClaudeProvider({ client }).rank({
      reviewer: S,
      question: "Q",
      answers: [
        { label: "A", text: "a" },
        { label: "B", text: "b" },
      ],
    });
    expect(out.value.items.map((i) => i.label)).toEqual(["A", "B"]);
    const cfg = requests[0]!.output_config as { format: { type: string } };
    expect(cfg.format.type).toBe("json_schema");
    expect((requests[0]!.system as SystemBlock[])[0]!.text).toContain("votering");
  });

  it("asks for the main vote as structured JSON and validates it", async () => {
    const { client, requests } = fakeClient([() => message({ content: [{ type: "text", text: JSON.stringify({ vote: "avstar", explanation: "Halvbra." }) }] })]);
    const out = await new ClaudeProvider({ client }).vote({ member: S, question: "Q", decision: "## Beslut\nX", ownProposal: "Y" });
    expect(out.value).toEqual({ choice: "avstar", explanation: "Halvbra." });
    expect((requests[0]!.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect((requests[0]!.system as SystemBlock[])[0]!.text).toContain("huvudvotering");
    expect(requests[0]!.messages).toEqual([{ role: "user", content: expect.stringContaining("<beslutsförslag>") }]);
    expect(out.usage[0]).toMatchObject({ stage: "vote", advisorId: "s" });
  });

  it("rejects a malformed vote", async () => {
    const { client } = fakeClient([() => message({ content: [{ type: "text", text: JSON.stringify({ vote: "kanske", explanation: "?" }) }] })]);
    await expect(new ClaudeProvider({ client }).vote({ member: S, question: "Q", decision: "X", ownProposal: "Y" })).rejects.toThrow(/vote schema/);
  });

  it("uses the Speaker's own model and effort for the decision", async () => {
    const { client, requests } = fakeClient([]);
    await new ClaudeProvider({ client }).synthesize({ talman, question: "Q", mode: "chairman", answers: [{ label: "A", text: "a" }], reviews: [] });
    expect((requests[0]!.output_config as { effort: string }).effort).toBe("high");
    expect((requests[0]!.system as SystemBlock[])[0]!.text).toContain("Valt förslag");
  });

  it("records usage, round, cache reads and cost", async () => {
    const { client } = fakeClient([]);
    const r = await new ClaudeProvider({ client }).speak(opening({ round: 1, transcript: [{ round: 0, memberId: "m", speaker: "X (M)", text: "t" }] }));
    const u = r.usage[0]!;
    expect(u).toMatchObject({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, stage: "debate", round: 1, advisorId: "s" });
    expect(u.costUsd).toBeCloseTo((1000 * 4 + 500 * 20 + 2000 * 0.2) / 1e6);
  });

  it("bills each attempt from usage.iterations when a fallback ran", async () => {
    const usage = {
      input_tokens: 10,
      output_tokens: 10,
      iterations: [
        { type: "message", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      ],
    };
    const { client } = fakeClient([() => message({ usage })]);
    const r = await new ClaudeProvider({ client }).speak(opening());
    expect(r.usage).toHaveLength(2);
    expect(r.usage[1]!.fellBack).toBe(true);
  });
});

describe("ClaudeProvider error handling", () => {
  it("throws RefusalError on stop_reason refusal and does not read content", async () => {
    const { client } = fakeClient([() => message({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [] })]);
    await expect(new ClaudeProvider({ client }).speak(opening())).rejects.toBeInstanceOf(RefusalError);
  });

  it("retries 429s with backoff and then succeeds", async () => {
    const { client, requests } = fakeClient([
      () => {
        throw rateLimit();
      },
      () => {
        throw rateLimit();
      },
      () => message(),
    ]);
    const r = await new ClaudeProvider({ client, backoffBaseMs: 0 }).speak(opening());
    expect(requests).toHaveLength(3);
    expect(r.value).toContain("Förslag");
  });

  it("gives up after 5 attempts", async () => {
    const { client, requests } = fakeClient(
      Array.from({ length: 10 }, () => () => {
        throw rateLimit();
      }),
    );
    await expect(new ClaudeProvider({ client, backoffBaseMs: 0 }).speak(opening())).rejects.toBeInstanceOf(Anthropic.RateLimitError);
    expect(requests).toHaveLength(5);
  });

  it("does not retry client errors", async () => {
    const bad = () => new Anthropic.BadRequestError(400, { type: "error" }, "bad", new Headers());
    const { client, requests } = fakeClient([
      () => {
        throw bad();
      },
    ]);
    await expect(new ClaudeProvider({ client, backoffBaseMs: 0 }).speak(opening())).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(requests).toHaveLength(1);
  });

  it("raises max_tokens and retries when a response is cut off", async () => {
    const { client, requests } = fakeClient([() => message({ stop_reason: "max_tokens" }), () => message()]);
    const r = await new ClaudeProvider({ client }).speak(opening());
    expect(requests.map((x) => x.max_tokens)).toEqual([16_000, 32_000]);
    expect(r.usage).toHaveLength(2); // the truncated attempt was still billed
  });
});

describe("Semaphore", () => {
  it("never runs more than the limit at once", async () => {
    const gate = new Semaphore(5);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, () =>
        gate.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(5);
  });
});
