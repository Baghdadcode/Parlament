import { providerOf, type ProviderId } from "../config/models";
import type {
  CallResult,
  MemberDef,
  ParlamentProvider,
  RankRequest,
  RankingOutput,
  SpeakRequest,
  SynthesizeRequest,
  VoteOutput,
  VoteRequest,
} from "../core/types";

/**
 * Sends each call to the provider that serves the member's model, so a sitting can run on Claude, on Gemini, or on a
 * mix (each member file can name its own model). Providers are created on first use, so a missing key only matters
 * when a model that needs it is actually called.
 */
export class RouterProvider implements ParlamentProvider {
  private readonly instances = new Map<ProviderId, ParlamentProvider>();

  constructor(private readonly factories: Record<ProviderId, () => ParlamentProvider>) {}

  private for(member: Pick<MemberDef, "model">): ParlamentProvider {
    const id = providerOf(member.model);
    if (!id) throw new Error(`Okänd modell "${member.model}": använd en Claude- eller Gemini-modell.`);
    let p = this.instances.get(id);
    if (!p) {
      p = this.factories[id]();
      this.instances.set(id, p);
    }
    return p;
  }

  speak(req: SpeakRequest): Promise<CallResult<string>> {
    return this.for(req.member).speak(req);
  }

  rank(req: RankRequest): Promise<CallResult<RankingOutput>> {
    return this.for(req.reviewer).rank(req);
  }

  synthesize(req: SynthesizeRequest): Promise<CallResult<string>> {
    return this.for(req.talman).synthesize(req);
  }

  vote(req: VoteRequest): Promise<CallResult<VoteOutput>> {
    return this.for(req.member).vote(req);
  }
}
