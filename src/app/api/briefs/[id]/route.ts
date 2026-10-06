import { z } from "zod";
import { deleteBrief, getBrief, saveBrief } from "../../../../db/queries";
import { getDb } from "../../../../server/runtime";
import { badRequest, json, readJson } from "../../../../server/http";

export const dynamic = "force-dynamic";

const schema = z.object({ name: z.string().trim().min(1).max(120), content: z.string().max(200_000) });
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const brief = await getBrief(await getDb(), (await params).id);
  return brief ? json(brief) : json({ error: "Not found" }, 404);
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const db = await getDb();
    if (!(await getBrief(db, id))) return json({ error: "Not found" }, 404);
    return json(await saveBrief(db, { id, ...(await readJson(req, schema)) }));
  } catch (err) {
    return badRequest(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  await deleteBrief(await getDb(), (await params).id);
  return new Response(null, { status: 204 });
}
