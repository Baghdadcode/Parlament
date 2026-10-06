import { z } from "zod";
import { listBriefs, saveBrief } from "../../../db/queries";
import { getDb } from "../../../server/runtime";
import { badRequest, json, readJson } from "../../../server/http";

export const dynamic = "force-dynamic";

const schema = z.object({ name: z.string().trim().min(1).max(120), content: z.string().max(200_000) });

export async function GET() {
  return json(await listBriefs(await getDb()));
}

export async function POST(req: Request) {
  try {
    const input = await readJson(req, schema);
    return json(await saveBrief(await getDb(), input), 201);
  } catch (err) {
    return badRequest(err);
  }
}
