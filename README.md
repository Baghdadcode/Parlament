# Parlament

A personal, local app: ask the Swedish Riksdag a question. The eight party leaders (AI personas built with Claude)
hold a **partiledardebatt**: an opening speech each ("Herr talman! …"), then two rounds of replies (*replikskifte*)
where they answer each other by name and can change their proposal. They **rank each other's final proposals
blind**, the **Speaker (Talmannen)** turns the winner into a proposed decision, and the chamber holds an **open
vote (huvudvotering)**: every party votes ja, nej or avstår with its seats.

Or pick **Debatt 1 mot 1**: two leaders of your choice debate face to face, and the Speaker decides who won. Either
side can also be **your own member**: anyone at all, from yourself to a historical figure, written as a markdown file.

It looks and feels like the chamber:
- **Chamber view:** a seating diagram (one dot per seat) with the Speaker's podium and the rostrum. The speaking
  party glows, and arrows show who replied to whom.
- **Talarlista:** the speakers' list, with numbered speeches ("Anf. 12") and speaking time.
- **Rostrum:** the current speech, with a broadcast-style name tag.
- **One speaker at a time:** while a sitting runs, speeches are shown in the speakers' list order, whatever order they
  arrive in. Each one is revealed word by word (about six words a second), stays up for 5 seconds, and then the next
  speaker takes the rostrum. The vote and the Speaker's decision or judgment follow once every speech has been shown.
  **Nästa talare ⏭** skips ahead and **Visa allt** shows everything at once. The pace is set by `WORD_MS` and
  `PAUSE_MS` in `src/components/playback.ts`. A saved sitting opens in full.
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
cp .env.example .env.local   # then add MISTRAL_API_KEY (free), and optionally Claude/Gemini keys
npm run dev                  # http://localhost:3000
```

You need at least one of these keys. They stay on the server side.
- **Mistral (the default, free):** `MISTRAL_API_KEY`, from console.mistral.ai. The free *Experiment* plan works:
  costs show as $0, and the app paces requests to about one per second to stay within its limits. A debate makes
  about 41 requests, so it takes a few minutes longer than on a paid plan. The free plan requires letting Mistral use
  your prompts for training. Your actual limits are at admin.mistral.ai/plateforme/limits. If you get rate-limit
  errors, raise `MISTRAL_MIN_INTERVAL_MS` in `.env.local`; on a paid plan, set `MISTRAL_TIER=paid`.
- **Claude:** `ANTHROPIC_API_KEY`, a Console API key from console.anthropic.com. A Claude.ai subscription does not
  work.
- **Gemini:** `GEMINI_API_KEY`, a Gemini API key from aistudio.google.com/apikey.

The database is created automatically in `data/parlament.db`.

## Choosing the AI model

The ask form has an **AI-modell** picker:
- **Enligt ledamotsfilerna (default):** each member uses the `model:` in their own file. The files ship with
  `mistral-large-latest`. A sitting can mix providers, e.g. one party on Gemini and the rest on Mistral.
- **A Mistral model (Large, Medium, Small):** every leader and the Speaker use it for this sitting. With a working key
  the list comes from Mistral's API (the current `-latest` chat models).
- **A Claude model (Opus 5.5, Sonnet 5.5):** the same, with Claude.
- **A Gemini model:** the same, with Gemini. With a working key the list comes from the Gemini API itself (the text
  models your key can use, newest first). Without one, it shows Gemini 3.1 Pro and Gemini 3.8 Flash.

Models whose key is missing are greyed out. A key that is set but rejected shows a warning at the top of the page.
The sitting shows which model it ran on ("AI: …"), and the cost estimate follows the choice.

All providers get the same prompts. A member's `effort` becomes Gemini's thinking level, or Mistral's reasoning
effort on models that support it. Models missing from the price table, such as a new preview or a dated version, are
priced like their family (Pro/Flash, Large/Medium/Small), so their cost is approximate.

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
the diagram from left to right (`placement`), model (`claude-opus-5-5`, the cheaper `claude-sonnet-5-5`, or a Gemini model such as `gemini-3.1-pro-preview`), effort,
and whether the member takes part (`enabled`). In `talman.md`, `address` sets how speeches open ("Herr talman" or
"Fru talman"). Everything below it is the persona,
sent to the model verbatim: personality, ideology, debating style, relations to other parties and red lines.
`<!-- comments -->` are removed first.

The files are re-read for every question, so an edit applies to the next question without a restart. To add a
member, add a file; to remove one, set `enabled: false`. A debate takes 3–9 members. See
[`members/README.md`](members/README.md) for the full format. The **Ledamöter** page in the app shows what was loaded,
and a broken file shows its error at the top of every page.

### Your own members (egna ledamöter)

Anyone can debate 1 mot 1: you, a friend, a local politician, a historical figure or a character from a novel. Each
one is a markdown file in [`members/egna/`](members/egna/), in the same format as the leaders, but only `name:` and a
description are required. The id comes from the name, the abbreviation from the initials, and the colour from a
palette; `title`, `party`, `short`, `color`, `model` and `effort` are optional. The repo ships one example,
`astrid-lindgren.md`.

Create them on the **Ledamöter** page under *Egna ledamöter*: write the file from a template (**+ Ny ledamot**),
upload a ready-made `.md` file (**Ladda upp .md-fil**), or edit and delete existing ones. You can also put files in the
folder directly. A file with an error, or with an id or abbreviation already taken by someone else, is skipped and
its error is shown on that page; it never stops the regular debate. Your own members take part only in 1-mot-1
debates, not in the partiledardebatt. See [`members/egna/README.md`](members/egna/README.md) for the format.

## How a question runs

Each question becomes a numbered sitting, e.g. *Riksdagens protokoll 2026/27:14*. A new riksmöte starts in
September.

1. **Anföranden (opening speeches):** all members speak in parallel without hearing each other. Each speech is one
   short paragraph of running text (at most about 90 words, no headings) that opens with "Herr talman!". Other leaders
   are referred to in the third person.
2. **Replikskifte 1 and 2 (rebuttal rounds):** each member reads the whole debate so far, with names, and answers one
   or two opponents by name, then says where they stand now and whether they changed their mind. This is also one
   short paragraph, at most about 70 words. The transcript is a cached prompt block shared by every member in the round.
3. **Förberedande votering (preliminary vote):** each member ranks the other members' final speech (minus "Herr
   talman!"; the last round's speech ends with a sentence stating the proposal), with
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

### Debatt 1 mot 1

Under **Debattform** on the ask page, choose **Debatt 1 mot 1** and pick two debaters: who opens (*Inleder*) and who
answers (*Mot*). ⇄ swaps them. Each list has the party leaders and, under *Egna ledamöter*, your own members.

1. They speak one at a time, each hearing everything said so far: an opening speech each, then two replies each
   (A, B, A, B, A, B). Every speech is one short paragraph, as in the party debate.
2. **Talmannens avgörande (the Speaker's judgment):** the Speaker reads the whole debate and names the winner on the
   first line ("Vinnare: …"), followed by a short `## Motivering` and each debater's strongest argument. It judges
   who argued best: concrete arguments, how well each answered the other, and whether the proposal holds up, not
   which party it prefers or which is bigger. A draw is not allowed.

There is no vote and nothing is anonymous. The chamber view shows the two debaters face to face, and the winner gets a
crown. If a debater fails to speak, the debate stops. A 1-mot-1 debate makes 7 API calls. The history list marks
these sittings "1 mot 1".

**Cost:** a question makes about 41 API calls. On Mistral's free plan that costs nothing. With 8 Claude Opus members
the app estimates about $2 before you run it, and shows the real cost afterwards. Sonnet roughly halves that, and
Gemini Flash and paid Mistral cost less still. To change the number of
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
| `npm run test:live` | Short real debates: Claude Sonnet (well under $1), plus Gemini Flash and Mistral Small if their keys are set |
| `npm run lint` / `npm run typecheck` | Checks |

See `ROADMAP.md` for what is done and the defaults chosen along the way.
