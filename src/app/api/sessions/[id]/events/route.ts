import { getSessionDetail } from "../../../../../db/queries";
import { getDb, subscribe, type StreamEvent } from "../../../../../server/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-sent events: replays the run so far, then streams live progress until the session is saved. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      const send = (e: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        if (e.type === "saved" || e.type === "error") close();
      };
      const heartbeat = setInterval(() => !closed && controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      req.signal.addEventListener("abort", close);

      let unsubscribe: (() => void) | null = null;
      unsubscribe = subscribe(id, send);
      if (!unsubscribe) {
        // Not running in this process: either already saved, or unknown.
        const detail = await getSessionDetail(await getDb(), id);
        send(detail ? { type: "saved", sessionId: id } : { type: "error", message: "Sessionen hittades inte (den kan ha avbrutits när servern startades om)." });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
