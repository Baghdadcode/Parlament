// Server-side singletons for the Next.js app: database, provider, API-key status and live session runs.
// Imported only by route handlers, server components and instrumentation; the API key never leaves this process.
import { randomUUID } from "node:crypto";
import { openDb, type ParlamentDb } from "../db/client";
import { saveSession } from "../db/store";
import { getBrief, maxSittingNumber } from "../db/queries";
import { runSession, type SessionEvent } from "../core/orchestrator";
import { ClaudeProvider, checkApiKey } from "../providers/claude";
import { GeminiProvider, listGeminiModels } from "../providers/gemini";
import { MistralProvider, listMistralModels } from "../providers/mistral";
import { RouterProvider } from "../providers/router";
import { FakeProvider } from "../providers/fake";
import { loadMembers, type LoadedMembers } from "../members/load";
import { loadEnv, MissingApiKeyError, MissingGeminiKeyError, MissingMistralKeyError, mistralTier } from "../config/env";
import { DEBATE_ROUNDS } from "../config/models";
import { toMemberView, type MemberView } from "../core/view";
import { riksmote as riksmoteOf } from "../core/riksdag";
import { applyModel, assertUsable, type ProviderState, type ProviderStatus } from "../core/models";
import type { ParlamentProvider, SessionBrief, VotingMode } from "../core/types";

export type StreamEvent =
  | SessionEvent
  | {
      type: "started";
      sessionId: string;
      question: string;
      mode: VotingMode;
      rounds: number;
      riksmote: string;
      number: number;
      createdAt: string;
      seats: MemberView[];
      talman: MemberView;
      brief: { name: string; updatedAt: string } | null;
    }
  | { type: "saved"; sessionId: string }
  | { type: "error"; message: string };

interface LiveRun {
  events: StreamEvent[];
  listeners: Set<(e: StreamEvent) => void>;
  finished: boolean;
}

interface Globals {
  db?: Promise<ParlamentDb>;
  provider?: ParlamentProvider;
  keyStatus?: Promise<KeyStatus>;
  runs?: Map<string, LiveRun>;
  /** Last sitting number handed out per riksmöte, so runs that start together get distinct numbers. */
  numbers?: Map<string, number>;
}

// Survives Next.js dev hot reloads, which re-evaluate modules.
const g = globalThis as typeof globalThis & { __parlament?: Globals };
const state: Globals = (g.__parlament ??= {});

export const isFake = () => {
  loadEnv();
  return process.env.PARLAMENT_FAKE === "1";
};

export function getDb(): Promise<ParlamentDb> {
  // Fake runs get their own file so canned sessions never mix with real ones.
  state.db ??= openDb(isFake() && !process.env.PARLAMENT_DB_PATH ? "./data/parlament-fake.db" : undefined);
  return state.db;
}

export function getProvider(): ParlamentProvider {
  // Each call goes to Claude or Gemini depending on the member's model.
  state.provider ??= isFake()
    ? new FakeProvider({ chunkDelayMs: 15 })
    : new RouterProvider({ anthropic: () => new ClaudeProvider(), google: () => new GeminiProvider(), mistral: () => new MistralProvider() });
  return state.provider;
}

export type MembersStatus = ({ ok: true } & LoadedMembers) | { ok: false; error: string };

/** Reads the member files fresh every time, so edits apply without restarting the server. */
export function getMembers(): MembersStatus {
  try {
    return { ok: true, ...loadMembers() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type KeyStatus = ProviderStatus;

async function check(fn: () => Promise<unknown>, missingType: new () => Error): Promise<ProviderState> {
  try {
    await fn();
    return { ok: true, missing: false, error: null };
  } catch (err) {
    return { ok: false, missing: err instanceof missingType, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Startup check of every key: one cheap Models API call each (the Gemini call also lists the models the key can
 * use). Cached; pass recheck to try again after fixing .env.local.
 */
export function getKeyStatus(recheck = false): Promise<KeyStatus> {
  if (recheck || !state.keyStatus) {
    state.keyStatus = (async (): Promise<KeyStatus> => {
      const ok: ProviderState = { ok: true, missing: false, error: null };
      const tier = mistralTier();
      if (isFake()) {
        return { fake: true, ok: true, providers: { anthropic: ok, google: ok, mistral: ok }, geminiModels: null, mistralModels: null, mistralTier: tier };
      }
      let geminiModels: KeyStatus["geminiModels"] = null;
      let mistralModels: KeyStatus["mistralModels"] = null;
      const [anthropic, google, mistral] = await Promise.all([
        check(() => checkApiKey(), MissingApiKeyError),
        check(async () => {
          geminiModels = await listGeminiModels();
        }, MissingGeminiKeyError),
        check(async () => {
          mistralModels = await listMistralModels();
        }, MissingMistralKeyError),
      ]);
      return {
        fake: false,
        ok: anthropic.ok || google.ok || mistral.ok,
        providers: { anthropic, google, mistral },
        geminiModels,
        mistralModels,
        mistralTier: tier,
      };
    })();
  }
  return state.keyStatus;
}

const runs = (): Map<string, LiveRun> => (state.runs ??= new Map());

export interface StartInput {
  question: string;
  briefId?: string | null;
  mode: VotingMode;
  rounds?: number;
  /** One model for every member and the Speaker; empty keeps the model each member file names. */
  model?: string | null;
}

/** Starts a debate in the background and returns its id; progress is delivered via subscribe(). */
export async function startSession(input: StartInput): Promise<string> {
  const files = loadMembers();
  const [talman, ...members] = applyModel([files.talman, ...files.members], input.model);
  const loaded = { ...files, members, talman: talman! };
  assertUsable(await getKeyStatus(), [loaded.talman, ...loaded.members].map((m) => m.model));
  const db = await getDb();
  const briefView = input.briefId ? await getBrief(db, input.briefId) : null;
  if (input.briefId && !briefView) throw new Error(`Okänd bakgrund "${input.briefId}"`);
  const brief: SessionBrief | undefined = briefView
    ? { id: briefView.id, name: briefView.name, content: briefView.content, updatedAt: new Date(briefView.updatedAt) }
    : undefined;
  const rounds = input.rounds ?? DEBATE_ROUNDS;
  const createdAt = new Date();
  const riksmote = riksmoteOf(createdAt);
  const numbers = (state.numbers ??= new Map());
  const number = Math.max(await maxSittingNumber(db, riksmote), numbers.get(riksmote) ?? 0) + 1;
  numbers.set(riksmote, number);

  const id = randomUUID();
  const run: LiveRun = { events: [], listeners: new Set(), finished: false };
  runs().set(id, run);
  const push = (e: StreamEvent) => {
    run.events.push(e);
    for (const l of run.listeners) l(e);
  };
  push({
    type: "started",
    sessionId: id,
    question: input.question,
    mode: input.mode,
    rounds,
    riksmote,
    number,
    createdAt: createdAt.toISOString(),
    seats: loaded.members.map(toMemberView),
    talman: toMemberView(loaded.talman),
    brief: briefView ? { name: briefView.name, updatedAt: briefView.updatedAt } : null,
  });

  void (async () => {
    try {
      const result = await runSession(
        {
          question: input.question,
          brief: brief?.content,
          members: loaded.members,
          talman: loaded.talman,
          mode: input.mode,
          rounds,
          onEvent: push,
        },
        getProvider(),
      );
      await saveSession(db, {
        id,
        question: input.question,
        members: loaded.members,
        talman: loaded.talman,
        riksmote,
        number,
        brief,
        result,
        createdAt,
      });
      push({ type: "saved", sessionId: id });
    } catch (err) {
      push({ type: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      run.finished = true;
      // Keep the buffer briefly so a reconnecting browser can replay it, then drop it.
      setTimeout(() => runs().delete(id), 10 * 60_000).unref?.();
    }
  })();
  return id;
}

export function getLiveRun(id: string): { events: StreamEvent[]; finished: boolean } | null {
  const r = runs().get(id);
  return r ? { events: r.events, finished: r.finished } : null;
}

/** Replays buffered events, then forwards new ones. Returns an unsubscribe function. */
export function subscribe(id: string, listener: (e: StreamEvent) => void): (() => void) | null {
  const r = runs().get(id);
  if (!r) return null;
  for (const e of r.events) listener(e);
  if (r.finished) return () => undefined;
  r.listeners.add(listener);
  return () => r.listeners.delete(listener);
}
