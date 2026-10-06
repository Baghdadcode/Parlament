import { z } from "zod";
import { listSessions } from "../../../db/queries";
import { getDb, getKeyStatus, startSession } from "../../../server/runtime";
import { badRequest, json, readJson } from "../../../server/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(3, "Ställ en fråga först").max(20_000),
  briefId: z.string().nullish(),
  mode: z.enum(["full", "chairman"]),
  rounds: z.number().int().min(0).max(4).optional(),
});

export async function GET() {
  return json(await listSessions(await getDb()));
}

export async function POST(req: Request) {
  try {
    const input = await readJson(req, schema);
    const status = await getKeyStatus();
    if (!status.ok) return json({ error: status.error }, 412);
    return json({ id: await startSession(input) }, 202);
  } catch (err) {
    return badRequest(err);
  }
}
