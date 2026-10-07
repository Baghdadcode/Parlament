"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionReport, type SessionHeader } from "./SessionReport";
import { initialModel, reduce, type SessionMeta, type SessionModel } from "./model";
import { present, skipSpeech, startCursor, tick, WORD_MS, type Cursor } from "./playback";
import { chime, gavel } from "./sound";
import type { StreamEvent } from "../server/runtime";

/**
 * Sounds of the sitting as the viewer sees it: the gavel opens each round and closes the vote or the judgment; a
 * chime opens the vote and the judgment.
 */
function useSounds(m: SessionModel) {
  const prev = useRef<{ round: number; stage: string; ended: boolean } | null>(null);
  useEffect(() => {
    const ended = m.finalTally !== null || m.winnerSeatId !== null;
    const p = prev.current;
    prev.current = { round: m.round, stage: m.stage, ended };
    if (!p) return;
    if (m.round !== p.round && (m.stage === "opening" || m.stage === "debating")) gavel();
    else if (m.stage !== p.stage && (m.stage === "ranking" || m.stage === "voting" || m.stage === "judging")) chime();
    if (ended && !p.ended) gavel();
  }, [m.round, m.stage, m.finalTally, m.winnerSeatId]);
}

/**
 * Streams a running sitting over server-sent events and presents it one speech at a time (see playback.ts), then
 * hands over to the saved version once everything has been shown.
 */
export function LiveSession({ id, meta, header }: { id: string; meta: SessionMeta; header: SessionHeader }) {
  const router = useRouter();
  const [model, dispatch] = useReducer(reduce, meta, initialModel);
  const [cursor, setCursor] = useState<Cursor | null>(() => startCursor(initialModel(meta)));
  // The playback timer reads the newest model without restarting on every streamed word.
  const latest = useRef(model);
  useEffect(() => {
    latest.current = model;
  }, [model]);

  useEffect(() => {
    const es = new EventSource(`/api/sessions/${id}/events`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as StreamEvent;
      dispatch(e);
      if (e.type === "saved" || e.type === "error") es.close();
    };
    es.onerror = () => {
      // EventSource reconnects on its own; the server replays everything so far.
    };
    return () => es.close();
  }, [id]);

  const playing = cursor !== null;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setCursor((c) => tick(c, latest.current, Date.now())), WORD_MS);
    return () => clearInterval(t);
  }, [playing]);

  // The server page shows the stored sitting; switch to it only once playback has caught up.
  useEffect(() => {
    if (model.saved && !playing) router.refresh();
  }, [model.saved, playing, router]);

  const shown = present(model, cursor);
  useSounds(shown);

  return (
    <SessionReport
      header={header}
      model={shown}
      playback={
        playing
          ? {
              next: () => setCursor((c) => skipSpeech(c, latest.current)),
              showAll: () => setCursor(null),
            }
          : undefined
      }
    />
  );
}
