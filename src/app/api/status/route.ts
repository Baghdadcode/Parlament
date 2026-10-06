import { getKeyStatus } from "../../../server/runtime";
import { json } from "../../../server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const recheck = new URL(req.url).searchParams.get("recheck") === "1";
  return json(await getKeyStatus(recheck));
}
