# Parlament: Roadmap

A personal, local-only app. Ask the Swedish Riksdag a question, the party leaders debate it, rank each other's final
proposals blind, the Speaker writes a proposed decision, and the chamber votes on it. One user, one machine, one Anthropic Console API key.
Forked from Majles: Next.js (App Router), TypeScript strict, Tailwind, `@anthropic-ai/sdk` only, and SQLite through
Drizzle on `node:sqlite`.

## Defaults chosen where the brief was open

- **Swedish throughout:** prompts, debate, vote reasoning, decision and UI.
- **Members are files, not database rows.** `members/*.md` (frontmatter plus a free-form persona) is re-read at the
  start of every session. Each session stores a snapshot of the members it used (with a content hash), so history
  shows the names and settings as they were, even after you edit a file.
- **Debate format:** an opening round and two rebuttal rounds (`DEBATE_ROUNDS` in `src/config/models.ts`). The
  debate is open: statements carry the speaker's name. Each member sees every earlier round, including their own
  statements.
- **The vote is blind:** a member's final `## Förslag` section is what goes to the vote. Leader names (full and
  surname, also in the genitive), party names and abbreviations are redacted. Single-letter abbreviations are only
  removed in parentheses or before a dash, so ordinary words survive. The last-round prompt also asks members not to
  name themselves in their proposal. Voters keep their persona but judge against a rubric (accuracy, reasoning,
  feasibility, risk awareness).
- **The Speaker is blind too:** it sees proposals as A–H and voters as "Ledamot 1…". The UI key maps them back.
- **Caching:** the system prompt is `[brief][debate so far][persona + task]`, with cache breakpoints on the first two
  blocks. Every member in a round shares the same prefix. Calls that start in the same instant each pay the cache
  write, but the concurrency cap of 5 means the later calls in a round can read it.
- **Failure handling:** a member who fails a round is dropped from the rest of the debate. At least
  `max(3, ceil(60% of members))` must remain after each round. A failed voter is skipped. If no vote survives, the
  Speaker decides alone.
- **Personas:** written from the parties' public positions as of the 2026 election. I could not verify leadership
  changes after the election, so check the files. Miljöpartiet has two spokespersons; the file uses Amanda Lind and
  explains how to switch to Daniel Helldén. The Speaker is a generic neutral role, not a real person.
- **Riksdag look and feel:** the app is inspired by the Riksdag but does not copy its emblem or identity, and it uses
  no photos of the leaders. Leaders appear as initials on their party colour. Every page, the decision and the
  record carry "SIMULERING".
- **Two votes:** the blind Borda ranking is now the *förberedande votering*, which picks the proposal the Speaker
  builds on. The *huvudvotering* is an open ja/nej/avstår vote on the Speaker's text, weighted by `seats`. Voters see
  proposal letters with their parties ("förslag B (V)"), because the main vote is open. The seat counts in the files
  are from the 2022 election and need updating to 2026.
- **One speaker at a time:** the speeches are still generated in parallel. The chamber view follows the speakers'
  list in order (the first unfinished speech is at the rostrum), and you can pick any speech or "Följ live".
- **Replik arrows** come from names found in a statement's `## Replik` section (full name or surname, also in the
  genitive).
- **Sitting numbers:** `riksmöte:N` counts sittings per riksmöte. The riksmöte starts in September.
- **Sound** is synthesised with Web Audio, off by default, remembered per browser, and not played for replayed events.
- **Two providers, one set of prompts:** a router sends each call to Claude or Gemini by model ID (`claude-…` or
  `gemini-…`), so a sitting can mix them. The picker can override every member's model for one sitting.
- **Gemini details:**
  - Gemini models come from the API's model list, and both keys are checked at startup.
  - Thinking level comes from `effort`; if a model rejects the setting, the provider retries without it.
  - Structured output uses `responseJsonSchema`, without `additionalProperties`.
  - The SDK's own retries are off, so retries and backoff work the same as for Claude.
  - Thinking tokens are billed as output, and cached tokens at the cache price.
- **Dropped from Majles:** councils and seat versioning in the database (replaced by the files), the council-vs-single
  eval CLI and the Stronghold TD brief. Briefs remain as "Bakgrund" (optional background material for a question).

## Done

- [x] Member files for the 8 party leaders plus the Speaker; loader with Zod validation and errors that name the file
- [x] Debate orchestrator: opening → rebuttal rounds → blind vote → Borda → Speaker; live events per round
- [x] Swedish prompts; `## Förslag` extraction; identity redaction for the blind vote
- [x] Claude provider: cached transcript block, per-round usage, plus everything carried over from Majles (retries, refusals, fallback, max_tokens)
- [x] SQLite schema: members (by hash), sessions (member snapshot), statements, proposals, rankings, verdicts, usage
- [x] UI: ask page with party chips and a cost estimate, live debate with round tabs and party colours, vote matrix,
      the decision with reservations, history, members page, background editor
- [x] Offline fake mode; unit tests and browser tests
- [x] Google Gemini as a second provider: model picker in the UI, per-file models, mixed sittings, per-provider key
      status
- [x] Riksdag look and feel: "Herr talman!" and third-person address, numbered speeches, sitting numbers and dates in
      the record's style; chamber diagram with replik arrows; talarlista with speaking time; rostrum with name tags
      and a live badge; voting board for the open main vote; Riksdagsbeslut document with party reservations;
      printable Protokoll; navy, gold and serif theme with dark mode; gavel and chime sounds

## Ideas (not started)

- [ ] Debate formats: interpellationsdebatt, utskottsbehandling (committee stage), frågestund, statsministerns frågestund
- [ ] Per-question round picker and a "only these parties" selector
- [ ] Follow-up questions that continue an earlier debate
- [ ] Edit member files from the browser
- [ ] Web search for facts during the debate (server-side tool)
