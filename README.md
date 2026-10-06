# Parlament

A personal, local app: ask the Swedish Riksdag a question. The eight party leaders (AI personas built with Claude)
hold a **partiledardebatt**: an opening speech each ("Herr talman! …"), then two rounds of replies (*replikskifte*)
where they answer each other by name and can change their proposal. They **rank each other's final proposals
blind**, the **Speaker (Talmannen)** turns the winner into a proposed decision, and the chamber holds an **open
vote (huvudvotering)**: every party votes ja, nej or avstår with its seats.

It looks and feels like the chamber:
- **Chamber view:** a seating diagram (one dot per seat) with the Speaker's podium and the rostrum. The speaking
  party glows, and arrows show who replied to whom.
- **Talarlista:** the speakers' list, with numbered speeches ("Anf. 12") and speaking time.
- **Rostrum:** the current speech, with a broadcast-style name tag.
- **Voting board:** the result of the main vote, then a knock of the gavel.
- **Decision:** a formal *Riksdagsbeslut* document, with reservations credited to their parties.
- **Protokoll:** the full record of proceedings, which you can print or save as PDF.
- **Sound:** an optional gavel and voting chime.

Every page is marked SIMULERING. The app is not connected to the Riksdag and does not use its logo.

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

The frontmatter sets the name, party, abbreviation, colour, title on the name tag, seats (`seats`, drawn in the chamber
and used to weight the main vote; the files ship with the 2022 election result, so update them to 2026), the place in
the diagram from left to right (`placement`), model (`claude-opus-5-5` or the cheaper `claude-sonnet-5-5`), effort,
and whether the member takes part (`enabled`). In `talman.md`, `address` sets how speeches open ("Herr talman" or
"Fru talman"). Everything below it is the persona,
sent to the model verbatim: personality, ideology, debating style, relations to other parties and red lines.
`<!-- comments -->` are removed first.

The files are re-read for every question, so an edit applies to the next question without a restart. To add a
member, add a file; to remove one, set `enabled: false`. A debate takes 3–9 members. See
[`members/README.md`](members/README.md) for the full format. The **Ledamöter** page in the app shows what was loaded,
and a broken file shows its error at the top of every page.

## How a question runs

Each question becomes a numbered sitting, e.g. *Riksdagens protokoll 2026/27:14*. A new riksmöte starts in
September.

1. **Anföranden (opening speeches):** all members speak in parallel without hearing each other (`## Förslag`,
   `## Motivering`, `## Risker`). Each speech opens with "Herr talman!", and other leaders are referred to in the
   third person.
2. **Replikskifte 1 and 2 (rebuttal rounds):** each member reads the whole debate so far, with names, and writes
   `## Replik` (answers at least two named opponents), `## Förslag` (their current proposal) and `## Rörelse` (what
   they changed, or why they stand firm). The transcript is a cached prompt block shared by every member in the round.
3. **Förberedande votering (preliminary vote):** each member ranks the other members' final `## Förslag`, with
   names, parties and abbreviations removed and in a fresh random order. They score each proposal 1–5 for accuracy,
   reasoning, feasibility and risk awareness, and the ranks are added up with a Borda count.
4. **Talmannens förslag (the Speaker's proposal):** the Speaker reads the anonymous proposals, the rankings and the
   tally. It writes a proposal with `## Rubrik` (title), `## Beslut` ("Riksdagen beslutar att 1. … 2. …"),
   `## Motivering`, `## Risker` and, if anyone dissented, `## Reservationer` ("Reservation 1 (förslag B, E): …").
   The app adds each proposal's party, so the document reads "förslag B (V)".
5. **Huvudvotering (main vote):** each leader votes ja, nej or avstår on the proposal, with a one-sentence
   explanation of vote, using their party's seats. The proposal passes if ja beats nej. Members who dropped out are
   counted as absent.

A member who fails a round is dropped from later rounds. At least 60% of the members (5 of 8) must remain. In
**Talmannen avgör** mode there is no preliminary vote; the Speaker picks the best proposal directly, and the main
vote still happens.

**Cost:** a question with 8 Opus members makes about 41 API calls. The app estimates about $2 before you run it,
and shows the real cost afterwards. Switching all members to Sonnet roughly halves the cost. To change the number of
rebuttal rounds, set `DEBATE_ROUNDS` in `src/config/models.ts`.

**Sound** is off by default. Turn it on with the "Ljud" button in the header: the gavel knocks at the start of each
round and when the vote closes, and a chime calls the chamber to vote. The sounds are synthesised in the browser,
with no audio files.

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
