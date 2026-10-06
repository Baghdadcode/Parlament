import { z } from "zod";
import { DEBATE_ROUNDS } from "../../../config/models";
import { estimateSessionCost } from "../../../core/estimate";
import { getBrief } from "../../../db/queries";
import { getDb, getMembers } from "../../../server/runtime";
import { badRequest, json, readJson } from "../../../server/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  briefId: z.string().nullish(),
  mode: z.enum(["full", "chairman"]),
  question: z.string().default(""),
});

export async function POST(req: Request) {
  try {
    const input = await readJson(req, schema);
    const loaded = getMembers();
    if (!loaded.ok) return json({ error: loaded.error }, 500);
    const brief = input.briefId ? await getBrief(await getDb(), input.briefId) : null;
    const usd = estimateSessionCost({
      members: loaded.members,
      talman: loaded.talman,
      mode: input.mode,
      rounds: DEBATE_ROUNDS,
      briefChars: brief?.content.length ?? 0,
      questionChars: input.question.length,
    });
    return json({ usd });
  } catch (err) {
    return badRequest(err);
  }
}
