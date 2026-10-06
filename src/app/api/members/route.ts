import { toMemberView } from "../../../core/view";
import { getMembers } from "../../../server/runtime";
import { json } from "../../../server/http";

export const dynamic = "force-dynamic";

/** The members as the files read right now, or the file error to show. */
export async function GET() {
  const m = getMembers();
  if (!m.ok) return json({ error: m.error }, 500);
  return json({ members: m.members.map(toMemberView), talman: toMemberView(m.talman) });
}
