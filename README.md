# Parlament

A personal, local app: ask the Swedish Riksdag a question. The eight party leaders (AI personas built with Claude)
**debate it with each other**: an opening statement each, then two rebuttal rounds where they read everyone's
statements, answer named opponents and can change their proposal. Then they **rank each other's final proposals blind**
(names and parties stripped, no one ranks their own) and the **Speaker (Talmannen)** writes the Riksdag's decision,
including reservations from those who disagreed.

It is a fork of [Majles](https://github.com/Baghdadcode/Majles) with the same stack: Next.js, SQLite, and
`@anthropic-ai/sdk`. The app's UI and the debate are in Swedish.

> The party leaders are AI simulations based on the parties' public positions. They do not express the real people's
> views, and facts in the persona files can be out of date.

## Setup

Requires Node 22.13 or newer.

```bash
npm install
cp .env.example .env.local   # then put your Console API key in it (console.anthropic.com)
npm run dev                  # http://localhost:3000
```

A Claude.ai subscription does not work: the app calls the Anthropic API with your own key, which stays on the
server side. The database is created automatically in `data/parlament.db`.

## Changing the members

Each participant is a markdown file in [`members/`](members/), which you can edit:

| File | Who |
|---|---|
| `socialdemokraterna.md` | Magdalena Andersson (S) |
| `sverigedemokraterna.md` | Jimmie Åkesson (SD) |
| `moderaterna.md` | Ulf Kristersson (M) |
| `vansterpartiet.md` | Nooshi Dadgostar (V) |
| `centerpartiet.md` | Elisabeth Thand Ringqvist (C) |
| `kristdemokraterna.md` | Ebba Busch (KD) |
| `miljopartiet.md` | Amanda Lind (MP) |
| `liberalerna.md` | Simona Mohamsson (L) |
| `talman.md` | The Speaker: a neutral role, not a real person. Does not debate or vote. |

The frontmatter sets the name, party, abbreviation, colour, model (`claude-opus-5-5` or the cheaper
`claude-sonnet-5-5`), effort, and whether the member takes part (`enabled`). Everything below it is the persona,
sent to the model verbatim: personality, ideology, debating style, relations to other parties and red lines.
`<!-- comments -->` are removed first.

The files are re-read for every question, so an edit applies to the next question without a restart. To add a
member, add a file; to remove one, set `enabled: false`. A debate takes 3–9 members. See
[`members/README.md`](members/README.md) for the full format. The **Ledamöter** page in the app shows what was loaded,
and a broken file shows its error at the top of every page.

## How a question runs

1. **Öppning (opening statements):** all members answer in parallel without seeing each other (`## Förslag`, `## Motivering`, `## Risker`).
2. **Replik 1 and 2 (rebuttal rounds):** each member reads the whole debate so far, with names, and writes
   `## Replik` (answers at least two named opponents), `## Förslag` (their current proposal) and `## Rörelse` (what
   they changed, or why they stand firm). The transcript is a cached prompt block shared by every member in the round.
3. **Votering (vote):** each member ranks the other members' final `## Förslag` with names, parties and abbreviations
   redacted, in a fresh random order, scoring each 1–5 for accuracy, reasoning, feasibility and risk awareness.
   The ranks are added up with a Borda count.
4. **Talmannen (the Speaker):** reads the anonymous proposals, the votes and the tally, and writes `## Beslut`,
   `## Motivering`, `## Risker` and, if anyone dissented, `## Reservationer`.

A member who fails a round is dropped from later rounds. At least 60% of the members (5 of 8) must remain. In
**Talmannen avgör** mode there is no vote: the Speaker picks the best proposal directly.

**Cost:** a question with 8 Opus members makes about 33 API calls. The app estimates about $1.80 before you run it;
the real cost is shown afterwards. Switching all members to Sonnet roughly halves the cost. To change the number of
rebuttal rounds, set `DEBATE_ROUNDS` in `src/config/models.ts`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | The app |
| `PARLAMENT_FAKE=1 npm run dev` | Offline with canned answers (no key, no cost, separate database). PowerShell: `$env:PARLAMENT_FAKE="1"; npm run dev` |
| `npm test` | Unit tests (never call the API) |
| `npm run test:e2e` | Browser tests in fake mode |
| `npm run test:live` | One short real-API debate with 3 Sonnet members (well under $1) |
| `npm run lint` / `npm run typecheck` | Checks |

See `ROADMAP.md` for what is done and the defaults chosen along the way.
