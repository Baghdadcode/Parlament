"use client";

import { useEffect, useReducer } from "react";
import { useRouter } from "next/navigation";
import { SessionReport, type SessionHeader } from "./SessionReport";
import { initialModel, reduce, type SessionMeta } from "./model";
import { chime, gavel } from "./sound";
import type { StreamEvent } from "../server/runtime";

/** Sounds of the sitting: the gavel opens each round and closes the vote or the judgment; a chime opens them. */
function playFor(e: StreamEvent): void {
  if (e.type === "round") gavel();
  else if (e.type === "state" && (e.state === "ranking" || e.state === "voting" || e.state === "judging")) chime();
  else if (e.type === "vote_result" || e.type === "duel_result") gavel();
}

/** Streams a running sitting over server-sent events, then hands over to the saved version. */
export function LiveSession({ id, meta, header }: { id: string; meta: SessionMeta; header: SessionHeader }) {
  const router = useRouter();
  const [model, dispatch] = useReducer(reduce, meta, initialModel);

  useEffect(() => {
    const es = new EventSource(`/api/sessions/${id}/events`);
    // Events replayed from before this page opened should not all play their sounds at once.
    const openedAt = Date.now();
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as StreamEvent;
      dispatch(e);
      if (Date.now() - openedAt > 1500) playFor(e);
      if (e.type === "saved") {
        es.close();
        router.refresh(); // the server page now renders the stored session
      } else if (e.type === "error") {
        es.close();
      }
    };
    es.onerror = () => {
      // EventSource reconnects on its own; the server replays everything so far.
    };
    return () => es.close();
  }, [id, router]);

  return <SessionReport header={header} model={model} />;
}
