// Runs once when the Next.js server starts: check the API key and the member files early and say so in the terminal.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getKeyStatus, getMembers } = await import("./server/runtime");
  const status = await getKeyStatus();
  if (!status.ok) console.error(`\n[parlament] API key check failed: ${status.error}\n`);
  else console.log(status.fake ? "[parlament] Offline fake mode (PARLAMENT_FAKE=1): no API calls." : "[parlament] API key OK.");
  const members = getMembers();
  if (!members.ok) console.error(`[parlament] Member files: ${members.error}`);
  else console.log(`[parlament] ${members.members.length} members loaded: ${members.members.map((m) => m.short).join(", ")}`);
}
