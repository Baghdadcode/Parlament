import { getSessionDetail } from "../../../../db/queries";
import { getDb, getLiveRun } from "../../../../server/runtime";
import { json } from "../../../../server/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSessionDetail(await getDb(), id);
  if (detail) return json(detail);
  if (getLiveRun(id)) return json({ id, running: true }, 202);
  return json({ error: "Not found" }, 404);
}
