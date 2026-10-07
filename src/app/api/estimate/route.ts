import { z } from "zod";
import { DEBATE_ROUNDS } from "../../../config/models";
import { estimateSessionCost } from "../../../core/estimate";
import { applyModel } from "../../../core/models";
import { getBrief } from "../../../db/queries";
import { getDb, getMembers, pickDebaters } from "../../../server/runtime";
import { badRequest, json, readJson } from "../../../server/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  briefId: z.string().nullish(),
  mode: z.enum(["full", "chairman"]),
  format: z.enum(["partiledardebatt", "duell"]).optional(),
  duel: z.array(z.string()).length(2).nullish(),
  question: z.string().default(""),
  model: z.string().max(100).nullish(),
});

export async function POST(req: Request) {
  try {
    const input = await readJson(req, schema);
    const loaded = getMembers();
    if (!loaded.ok) return json({ error: loaded.error }, 500);
    const brief = input.briefId ? await getBrief(await getDb(), input.briefId) : null;
    const participants = input.format === "duell" ? pickDebaters(loaded.members, input.duel) : loaded.members;
    const [talman, ...members] = applyModel([loaded.talman, ...participants], input.model);
    const usd = estimateSessionCost({
      members,
      talman: talman!,
      mode: input.mode,
      format: input.format,
      rounds: DEBATE_ROUNDS,
      briefChars: brief?.content.length ?? 0,
      questionChars: input.question.length,
    });
    return json({ usd });
  } catch (err) {
    return badRequest(err);
  }
}
