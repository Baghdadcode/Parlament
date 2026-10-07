import { describe, expect, it } from "vitest";
import {
  annotateLabels,
  judgmentBody,
  parseWinner,
  beslutPoints,
  mentions,
  parseDecision,
  riksmote,
  shortDate,
  sittingDate,
  sittingTime,
  speakingTime,
  tallyVotes,
  voteWeight,
} from "../src/core/riksdag";
import { loadMembers } from "../src/members/load";
import { chamberSeats, seatLayout } from "../src/components/hemicycle";
import { toMemberView } from "../src/core/view";

const { members } = loadMembers("members");

describe("dates and numbering", () => {
  it("starts a new riksmöte in September", () => {
    expect(riksmote(new Date(2026, 9, 6))).toBe("2026/27");
    expect(riksmote(new Date(2027, 2, 3))).toBe("2026/27");
    expect(riksmote(new Date(2027, 8, 1))).toBe("2027/28");
    expect(riksmote(new Date(2099, 9, 1))).toBe("2099/00");
  });
  it("writes dates the way the record does", () => {
    const d = new Date(2026, 9, 6, 13, 5);
    expect(sittingDate(d)).toBe("Tisdagen den 6 oktober 2026");
    expect(sittingTime(d)).toBe("kl. 13.05");
    expect(shortDate(d)).toBe("den 6 oktober 2026");
  });
  it("turns words into speaking time at 130 words a minute", () => {
    expect(speakingTime("ord ".repeat(130))).toBe("1:00");
    expect(speakingTime("ord ".repeat(400))).toBe("3:05");
    expect(speakingTime("")).toBe("0:00");
  });
});

describe("mentions", () => {
  it("finds opponents answered by name in the Replik section only", () => {
    const text = "## Replik\nHerr talman! Ulf Kristersson påstår att … och Åkessons linje håller inte.\n## Förslag\nSom Busch sa …";
    expect(mentions(text, members, "s").sort()).toEqual(["m", "sd"]);
  });
  it("ignores the speaker's own name and partial words", () => {
    expect(mentions("Jag, Magdalena Andersson, och Lindholmen.", members, "s")).toEqual([]);
  });
});

describe("annotateLabels", () => {
  const labels = [
    { label: "B", short: "V" },
    { label: "E", short: "MP" },
  ];
  it("adds the party to proposal letters, also in lists", () => {
    expect(annotateLabels("Förslag B och E ville mer. Enligt förslaget B.", labels)).toBe("Förslag B (V) och E (MP) ville mer. Enligt förslaget B (V).");
  });
  it("does not annotate twice or touch other words", () => {
    expect(annotateLabels("förslag B (V) och Bilagan", labels)).toBe("förslag B (V) och Bilagan");
    expect(annotateLabels("förslag E (efter votering)", labels)).toBe("förslag E (MP) (efter votering)");
    expect(annotateLabels("Valt förslag: B.", labels)).toBe("Valt förslag: B (V).");
  });
});

describe("parseDecision", () => {
  const text = [
    "Valt förslag: C. Mest genomförbart.",
    "## Rubrik",
    "Billigare el för hushållen",
    "## Beslut",
    "Riksdagen beslutar att",
    "1. bygga ut överföringen,",
    "2. följa upp årligen.",
    "## Motivering",
    "För att …",
    "## Risker",
    "Kostnader.",
    "## Reservationer",
    "### Reservation 1 (förslag B, E): Snabbare omställning",
    "B och E ville gå längre.",
    "### Reservation 2 (förslag D) – Sänkt skatt",
    "D ville sänka skatten.",
  ].join("\n");
  it("splits the Speaker's text into the parts of a decision", () => {
    const d = parseDecision(text);
    expect(d.preamble).toBe("Valt förslag: C. Mest genomförbart.");
    expect(d.title).toBe("Billigare el för hushållen");
    expect(beslutPoints(d.beslut)).toBe("1. bygga ut överföringen,\n2. följa upp årligen.");
    expect(d.motivering).toBe("För att …");
    expect(d.reservations).toEqual([
      { number: 1, title: "Snabbare omställning", letters: ["B", "E"], text: "B och E ville gå längre." },
      { number: 2, title: "Sänkt skatt", letters: ["D"], text: "D ville sänka skatten." },
    ]);
  });
  it("falls back to the whole text when there are no headings", () => {
    expect(parseDecision("Bara text.")).toMatchObject({ title: null, beslut: "Bara text.", reservations: [] });
  });
});

describe("main vote", () => {
  it("weighs by seats, or one vote each when no seats are set", () => {
    expect(voteWeight({ seats: 107 }, members)).toBe(107);
    expect(voteWeight({ seats: 0 }, [{ seats: 0 }, { seats: 0 }])).toBe(1);
  });
  it("passes when ja beats nej; avstår and absent do not count", () => {
    expect(tallyVotes([{ choice: "ja", weight: 100 }, { choice: "nej", weight: 90 }, { choice: "avstar", weight: 50 }, { choice: "franvarande", weight: 10 }])).toEqual({
      ja: 100,
      nej: 90,
      avstar: 50,
      franvarande: 10,
      passed: true,
    });
    expect(tallyVotes([{ choice: "ja", weight: 5 }, { choice: "nej", weight: 5 }]).passed).toBe(false);
    expect(tallyVotes([{ choice: "franvarande", weight: 5 }]).passed).toBeNull();
  });
});

describe("chamber diagram", () => {
  it("lays out exactly the requested seats inside the half-circle", () => {
    const seats = seatLayout(349);
    expect(seats).toHaveLength(349);
    for (const s of seats) expect(s.y).toBeLessThanOrEqual(204);
  });
  it("gives each party its seats, left to right by placement", () => {
    const parties = chamberSeats(members.map(toMemberView));
    expect(parties.map((p) => p.member.short)).toEqual(["V", "S", "MP", "C", "L", "KD", "M", "SD"]);
    expect(parties.map((p) => p.seats.length)).toEqual([24, 107, 18, 24, 16, 19, 68, 73]);
    expect(parties[0]!.centroid.x).toBeLessThan(parties.at(-1)!.centroid.x);
  });
  it("draws a fixed number of seats per party when no seats are set", () => {
    const parties = chamberSeats(members.slice(0, 3).map((m) => ({ ...toMemberView(m), seats: 0 })));
    expect(parties.every((p) => p.seats.length === 15)).toBe(true);
  });
});

describe("parseWinner", () => {
  const debaters = [
    { id: "m", name: "Ulf Kristersson", short: "M" },
    { id: "s", name: "Magdalena Andersson", short: "S" },
  ];
  it("reads the Vinnare line by full name, surname or party", () => {
    expect(parseWinner("Vinnare: Magdalena Andersson\n\n## Motivering\nUlf Kristersson …", debaters)).toBe("s");
    expect(parseWinner("**Vinnare:** Kristersson (M)", debaters)).toBe("m");
    expect(parseWinner("## Vinnare: (S)", debaters)).toBe("s");
    expect(parseWinner("Vinnare – Anderssons linje", debaters)).toBe("s");
  });
  it("takes whoever is named first, and gives null without a usable line", () => {
    expect(parseWinner("Vinnare: Ulf Kristersson, före Magdalena Andersson", debaters)).toBe("m");
    expect(parseWinner("Ulf Kristersson vann.", debaters)).toBeNull();
    expect(parseWinner("Vinnare: oavgjort", debaters)).toBeNull();
  });
  it("leaves the rest of the judgment for the page", () => {
    expect(judgmentBody("Vinnare: Ulf Kristersson\n\n## Motivering\nTydligast.")).toBe("## Motivering\nTydligast.");
  });
});
