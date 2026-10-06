import { describe, expect, it } from "vitest";
import { ClaudeProvider, checkApiKey } from "../src/providers/claude";
import { runSession } from "../src/core/orchestrator";
import { loadMembers } from "../src/members/load";
import { loadEnv } from "../src/config/env";

loadEnv();
// Opt-in: `npm run test:live` sets LIVE=1. Skipped by default so tests never spend money.
describe.skipIf(!process.env.LIVE)("live smoke test (real API)", () => {
  it("accepts the API key", async () => {
    await expect(checkApiKey()).resolves.toBeUndefined();
  });

  it("runs a short debate (3 Sonnet members, 1 rebuttal round) and sees prompt-cache reads", async () => {
    const { members, talman } = loadMembers("members");
    const three = members.slice(0, 3).map((m) => ({ ...m, model: "claude-sonnet-5-5" as const, effort: "low" as const }));
    const brief = `Bakgrund om elmarknaden.\n${"Elpriser, elområden, kärnkraft, vindkraft och överföring. ".repeat(500)}`;
    const result = await runSession(
      { question: "Ska Sverige slopa elområdena? Svara kort.", brief, members: three, talman, mode: "full", rounds: 1 },
      new ClaudeProvider(),
    );
    expect(result.state).toBe("done");
    expect(result.tally).toBeDefined();
    expect(result.verdict?.length).toBeGreaterThan(50);
    const cacheReads = result.usage.reduce((s, u) => s + u.cacheReadTokens, 0);
    console.log(`cost $${result.totalCostUsd.toFixed(4)}, cache read tokens: ${cacheReads}`);
    expect(cacheReads).toBeGreaterThan(0);
  }, 600_000);
});
