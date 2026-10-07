import type {
  CallResult,
  ParlamentProvider,
  RankRequest,
  RankingOutput,
  SpeakRequest,
  SynthesizeRequest,
  UsageRecord,
  VoteChoice,
  VoteOutput,
  VoteRequest,
} from "../core/types";
import { safeCost } from "./shared";

/** Fixed token counts, priced at the member's model so the cost follows the chosen model. */
const usage = (stage: UsageRecord["stage"], advisorId: string | null, model: string, round: number | null = null): UsageRecord[] => {
  const counts = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 };
  return [{ stage, advisorId, round, model, ...counts, costUsd: safeCost(model, counts), stopReason: "end_turn", fellBack: false }];
};

export interface FakeProviderOptions {
  /** Member id -> the round in which that member fails to speak. */
  failSpeakFor?: Record<string, number>;
  failRankFor?: string[];
  /** Member id -> preference order of member ids (best first) that this voter will rank. */
  preferences?: Record<string, string[]>;
  /** Member id -> main-vote choice. Default: ja, except a demo split (V and SD nej, MP avstår). */
  votes?: Record<string, VoteChoice>;
  failVoteFor?: string[];
  /** Milliseconds between streamed chunks, to exercise live UIs. 0 (default) streams instantly. */
  chunkDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deterministic provider for tests and offline mode; never touches the network. */
export class FakeProvider implements ParlamentProvider {
  readonly calls = { speak: 0, rank: 0, synthesize: 0, vote: 0 };
  readonly seen: { rank: RankRequest[]; synthesize: SynthesizeRequest[]; speak: SpeakRequest[]; vote: VoteRequest[] } = {
    rank: [],
    synthesize: [],
    speak: [],
    vote: [],
  };
  constructor(private readonly opts: FakeProviderOptions = {}) {}

  async speak(req: SpeakRequest): Promise<CallResult<string>> {
    this.calls.speak++;
    this.seen.speak.push(req);
    const m = req.member;
    if (this.opts.failSpeakFor?.[m.id] === req.round) throw new Error(`fake failure: ${m.id} round ${req.round}`);
    const address = req.address ?? "Herr talman";
    const text =
      req.round === 0
        ? `${address}! Som ${m.name} föreslår jag att ${m.party} tar ansvar för frågan med en tydlig reform. Det följer av ${m.short}:s grundvärderingar, och reformen följs upp årligen så att kostnaderna inte skenar. [id:${m.id}]`
        : `${address}! Jag har lyssnat på ${othersIn(req).join(" och ") || "kammaren"} och delar inte deras bild fullt ut. ${req.round === 1 ? "Jag har lagt till en årlig uppföljning." : "Jag står fast."} Mitt förslag efter replikskifte ${req.round}: en finansierad reform som följs upp årligen. [id:${m.id}]`;
    await this.stream(text, req.onText);
    return { value: text, usage: usage(req.round === 0 ? "opening" : "debate", m.id, m.model, req.round) };
  }

  private async stream(text: string, onText?: (delta: string) => void): Promise<void> {
    const delay = this.opts.chunkDelayMs ?? 0;
    if (!onText) return;
    if (delay === 0) return onText(text);
    for (const word of text.split(/(?<=\s)/)) {
      onText(word);
      await sleep(delay);
    }
  }

  async rank(req: RankRequest): Promise<CallResult<RankingOutput>> {
    this.calls.rank++;
    this.seen.rank.push(req);
    if (this.opts.failRankFor?.includes(req.reviewer.id)) throw new Error(`fake rank failure: ${req.reviewer.id}`);
    const pref = this.opts.preferences?.[req.reviewer.id];
    const scoreOf = (text: string) => {
      const id = /\[id:([\w-]+)\]/.exec(text)?.[1] ?? "";
      const idx = pref ? pref.indexOf(id) : 0;
      return idx === -1 ? 999 : idx;
    };
    const ordered = [...req.answers].sort((a, b) => scoreOf(a.text) - scoreOf(b.text) || a.label.localeCompare(b.label));
    return {
      value: {
        items: ordered.map((a, i) => ({
          label: a.label,
          rank: i + 1,
          correctness: 4,
          reasoningQuality: 4,
          usefulness: 4,
          risksCovered: 4,
          reasoning: `Placerad som nummer ${i + 1}.`,
        })),
      },
      usage: usage("rank", req.reviewer.id, req.reviewer.model),
    };
  }

  async synthesize(req: SynthesizeRequest): Promise<CallResult<string>> {
    this.calls.synthesize++;
    this.seen.synthesize.push(req);
    const text = [
      ...(req.mode === "chairman" ? ["Valt förslag: A. Det är det mest genomförbara förslaget.", ""] : []),
      "## Rubrik",
      "En finansierad reform med årlig uppföljning",
      "",
      "## Beslut",
      "Riksdagen beslutar att",
      `1. genomföra den finansierade reformen i förslag A (${req.mode === "full" ? "efter förberedande votering" : "talmannens avgörande"}),`,
      "2. ge regeringen i uppdrag att följa upp reformen årligen.",
      "",
      "## Motivering",
      "Förslaget fick brett stöd i kammaren.",
      "",
      "## Risker",
      "Kostnaderna måste följas upp.",
      "",
      "## Reservationer",
      "### Reservation 1 (förslag B, E): Gå längre",
      "Förslag B och E ville gå längre och snabbare.",
    ].join("\n");
    await this.stream(text, req.onText);
    return { value: text, usage: usage("synthesize", req.talman.id, req.talman.model) };
  }

  async vote(req: VoteRequest): Promise<CallResult<VoteOutput>> {
    this.calls.vote++;
    this.seen.vote.push(req);
    const id = req.member.id;
    if (this.opts.failVoteFor?.includes(id)) throw new Error(`fake vote failure: ${id}`);
    const choice = this.opts.votes?.[id] ?? DEMO_VOTES[id] ?? "ja";
    const explanation = {
      ja: "Vi röstar ja eftersom förslaget går i rätt riktning.",
      nej: "Vi röstar nej; förslaget räcker inte.",
      avstar: "Vi avstår; förslaget har både bra och dåliga delar.",
    }[choice];
    return { value: { choice, explanation }, usage: usage("vote", id, req.member.model) };
  }
}

export const DEMO_VOTES: Record<string, VoteChoice> = { v: "nej", sd: "nej", mp: "avstar" };

function othersIn(req: SpeakRequest): string[] {
  const names = req.transcript.filter((e) => e.memberId !== req.member.id).map((e) => e.speaker);
  return [...new Set(names)].slice(0, 2);
}
