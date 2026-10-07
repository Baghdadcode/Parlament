import { z } from "zod";
import { customTemplate, deleteCustomFile, listCustomFiles, saveCustomFile } from "../../../members/custom";
import { getMembers } from "../../../server/runtime";
import { badRequest, json, readJson } from "../../../server/http";

export const dynamic = "force-dynamic";

const saveSchema = z.object({
  content: z.string().min(1).max(100_000),
  /** The file being edited; missing for a new member. */
  previous: z.string().max(80).nullish(),
});

/** Your own members: the raw files, which of them loaded, and the errors of those that did not. */
export async function GET() {
  const loaded = getMembers();
  return json({
    files: listCustomFiles(),
    errors: loaded.ok ? loaded.customErrors : [],
    template: customTemplate(),
  });
}

/** Creates or replaces members/egna/<id>.md. */
export async function POST(req: Request) {
  try {
    const input = await readJson(req, saveSchema);
    return json(saveCustomFile(input.content, input.previous), 201);
  } catch (err) {
    return badRequest(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const file = new URL(req.url).searchParams.get("file") ?? "";
    deleteCustomFile(file);
    return new Response(null, { status: 204 });
  } catch (err) {
    return badRequest(err);
  }
}
