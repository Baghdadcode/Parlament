import { describe, expect, it } from "vitest";
import { anonymizeFor, redactIdentities, shuffle } from "../src/core/anonymize";
import { loadMembers } from "../src/members/load";

const { members } = loadMembers("members");
const answers = members.map((m) => ({ answerId: `ans-${m.id}`, seatId: m.id, text: `text of ${m.id}` }));

describe("anonymizeFor", () => {
  it("never shows a voter their own proposal (no self-ranking)", () => {
    for (const reviewer of members) {
      const a = anonymizeFor(reviewer, answers, members);
      expect(a.presented).toHaveLength(members.length - 1);
      expect(a.presented.map((p) => p.answerId)).not.toContain(`ans-${reviewer.id}`);
    }
  });

  it("labels proposals A.. in order and maps labels back", () => {
    const a = anonymizeFor(members[0]!, answers, members);
    expect(a.presented.map((p) => p.label)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    for (const p of a.presented) expect(a.labelToAnswerId.get(p.label)).toBe(p.answerId);
  });

  it("uses a fresh random order for each voter, deterministic for a seeded rng", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 40; i++) orders.add(anonymizeFor(members[0]!, answers, members).presented.map((p) => p.answerId).join(","));
    expect(orders.size).toBeGreaterThan(1);
    const rng = () => 0.3;
    expect(anonymizeFor(members[0]!, answers, members, rng).presented).toEqual(anonymizeFor(members[0]!, answers, members, rng).presented);
  });

  it("shuffle keeps all elements", () => {
    expect(shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("redactIdentities", () => {
  const redact = (s: string) => redactIdentities(s, members);

  it("removes leader names, surnames and genitives", () => {
    const out = redact("Som Magdalena Andersson sa, och till skillnad från Åkessons linje, menar Kristersson att...");
    expect(out).not.toMatch(/Andersson|Åkesson|Kristersson|Magdalena/);
    expect(out).toContain("[partiledare]");
  });

  it("removes party names, abbreviations in parentheses, multi-letter abbreviations and S-prefixes", () => {
    const out = redact("Vi i Socialdemokraterna (S) och Miljöpartiet vill, till skillnad från SD:s och KD, att S-regeringen agerar. Centerpartiets idé.");
    expect(out).not.toMatch(/Socialdemokraterna|Miljöpartiet|\(S\)|SD|KD|S-regeringen|Centerpartiet/);
  });

  it("leaves ordinary words and single capital letters alone", () => {
    const text = "Sverige behöver en moderat ökning, inte radikal. Steg A och M i planen. Vänster om mitten.";
    expect(redact(text)).toBe(text);
  });
});
