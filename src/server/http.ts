import { z } from "zod";

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export function badRequest(err: unknown) {
  const message = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : err instanceof Error ? err.message : String(err);
  return json({ error: message }, 400);
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new Error("Förfrågan måste vara JSON");
  }
  return schema.parse(body);
}
