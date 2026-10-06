import { BriefEditor } from "../../components/BriefEditor";
import { listBriefs } from "../../db/queries";
import { getDb } from "../../server/runtime";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const briefs = await listBriefs(await getDb());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Bakgrunder</h1>
        <p className="text-sm text-zinc-500">
          Underlag till en fråga: fakta, siffror, ett lagförslag eller en artikel. Bifoga en bakgrund till en fråga så läser alla partiledare och
          talmannen den. Sessioner minns när bakgrunden senast ändrades.
        </p>
      </div>
      <BriefEditor initial={briefs} />
    </div>
  );
}
