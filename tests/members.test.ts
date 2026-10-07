import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TALMAN, loadMembers, MemberFileError, parseFrontmatter, parseMemberFile } from "../src/members/load";
import { judgeSystem, memberSystem } from "../src/members/prompts";

const file = (fm: string, body = "## Vem du är\nEn testperson.") => `---\n${fm}\n---\n${body}\n`;
const valid = (id: string, short: string, extra = "") =>
  file(`id: ${id}\nname: Test ${id}\nparty: Parti ${id}\nshort: ${short}\ncolor: "#123456"\n${extra}`);

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "members-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("shipped member files", () => {
  const { members, talman, all } = loadMembers("members");

  it("seat the 8 Riksdag party leaders in order, plus the Speaker", () => {
    expect(members.map((m) => m.short)).toEqual(["S", "SD", "M", "V", "C", "KD", "MP", "L"]);
    expect(talman.role).toBe("talman");
    expect(talman.file).toBe("talman.md");
    expect(all).toHaveLength(9);
  });

  it("carry seats (349 in all), titles and a left-to-right placement", () => {
    expect(members.reduce((n, m) => n + m.seats, 0)).toBe(349);
    expect([...members].sort((a, b) => a.placement - b.placement).map((m) => m.short)).toEqual(["V", "S", "MP", "C", "L", "KD", "M", "SD"]);
    expect(members.find((m) => m.id === "mp")!.title).toBe("Språkrör");
    expect(talman.address).toBe("Herr talman");
  });

  it("have a persona, a colour and a valid model", () => {
    for (const m of [...members, talman]) {
      expect(m.persona.length).toBeGreaterThan(200);
      expect(m.persona).not.toContain("<!--");
      expect(m.color).toMatch(/^#/);
      expect(m.model).toBe("mistral-large-latest");
    }
  });
});

describe("parseMemberFile", () => {
  it("parses frontmatter with quotes, comments and defaults", () => {
    const m = parseMemberFile("x.md", file(`id: x\nname: "Anna Test"\nparty: Testpartiet\nshort: T # kort\ncolor: "#ff0000"\nenabled: ja`, "<!-- notis -->\nHej."));
    expect(m).toMatchObject({
      id: "x",
      name: "Anna Test",
      short: "T",
      role: "ledamot",
      enabled: true,
      model: "mistral-large-latest",
      effort: "medium",
      persona: "Hej.",
      title: "Partiledare",
      seats: 0,
      placement: 50,
      address: "Herr talman",
    });
    expect(m.hash).toHaveLength(12);
  });

  it("names the file and field in errors", () => {
    expect(() => parseMemberFile("bad.md", file(`id: x\nname: X\nparty: P\nshort: X\ncolor: red`))).toThrow(/bad\.md: color/);
    expect(() => parseMemberFile("bad.md", file(`id: x\nname: X\nparty: P\nshort: X\ncolor: "#fff"\nmodel: gpt-5`))).toThrow(/bad\.md: model/);
    expect(() => parseMemberFile("bad.md", "no frontmatter")).toThrow(MemberFileError);
    expect(() => parseMemberFile("bad.md", file(`id: x\nname: X\nparty: P\nshort: X\ncolor: "#fff"`, "<!-- bara kommentar -->"))).toThrow(/persona/);
  });

  it("parseFrontmatter rejects lines that are not key: value", () => {
    expect(() => parseFrontmatter("---\njust text\n---\nbody")).toThrow(/key: value/);
  });
});

describe("loadMembers", () => {
  it("skips disabled members and README.md, and falls back to a default Speaker", () => {
    const dir = dirWith({
      "README.md": "# not a member",
      "a.md": valid("a", "A", "order: 2"),
      "b.md": valid("b", "B", "order: 1"),
      "c.md": valid("c", "C"),
      "d.md": valid("d", "D", "enabled: false"),
    });
    const r = loadMembers(dir);
    expect(r.members.map((m) => m.id)).toEqual(["b", "a", "c"]);
    expect(r.all).toHaveLength(4);
    expect(r.talman).toBe(DEFAULT_TALMAN);
  });

  it("rejects duplicate ids, too few members and two Speakers", () => {
    expect(() => loadMembers(dirWith({ "a.md": valid("a", "A"), "b.md": valid("a", "B"), "c.md": valid("c", "C") }))).toThrow(/already used/);
    expect(() => loadMembers(dirWith({ "a.md": valid("a", "A"), "b.md": valid("b", "B") }))).toThrow(/3 to 9/);
    expect(() =>
      loadMembers(
        dirWith({
          "a.md": valid("a", "A"),
          "b.md": valid("b", "B"),
          "c.md": valid("c", "C"),
          "t1.md": valid("t1", "T1", "role: talman"),
          "t2.md": valid("t2", "T2", "role: talman"),
        }),
      ),
    ).toThrow(/talman/);
  });
});

describe("1-mot-1 prompts", () => {
  const { members: all, talman } = loadMembers("members");
  const [a, b] = [all[0]!, all[2]!];
  it("tells each debater who they face and asks for one short paragraph", () => {
    const sys = memberSystem(a, 1, 2, "Herr talman", b);
    expect(sys).toContain(`debatt 1 mot 1 mellan dig och ${b.name} (${b.short})`);
    expect(sys).toContain("replik 1 av 2");
    expect(sys).toContain("högst 70 ord");
    expect(sys).not.toContain("votering");
    expect(memberSystem(a, 2, 2, "Herr talman", b)).toContain("sista replik");
  });
  it("asks the Speaker for a winner by name, never a draw", () => {
    const sys = judgeSystem(talman, [a, b]);
    expect(sys).toContain(`"Vinnare: <fullständigt namn>"`);
    expect(sys).toContain(`${a.name} eller ${b.name}`);
    expect(sys).toContain("inte bli oavgjort");
  });
});
