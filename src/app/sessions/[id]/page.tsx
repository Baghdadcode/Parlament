import { notFound } from "next/navigation";
import { getSessionDetail } from "../../../db/queries";
import { getDb, getLiveRun, type StreamEvent } from "../../../server/runtime";
import { SessionReport } from "../../../components/SessionReport";
import { LiveSession } from "../../../components/LiveSession";
import { modelFromDetail } from "../../../components/model";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSessionDetail(await getDb(), id);
  if (detail) {
    return <SessionReport model={modelFromDetail(detail)} header={{ question: detail.question, brief: detail.brief, usage: detail.usage }} />;
  }

  // Still running in this server process: stream it.
  const started = getLiveRun(id)?.events.find((e): e is Extract<StreamEvent, { type: "started" }> => e.type === "started");
  if (!started) notFound();
  return (
    <LiveSession
      id={id}
      meta={{
        format: started.format,
        seats: started.seats,
        talman: started.talman,
        mode: started.mode,
        rounds: started.rounds,
        riksmote: started.riksmote,
        number: started.number,
        createdAt: started.createdAt,
      }}
      header={{ question: started.question, brief: started.brief }}
    />
  );
}
