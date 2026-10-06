// Runs once when the Next.js server starts: check the API keys and the member files early and say so in the terminal.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getKeyStatus, getMembers } = await import("./server/runtime");
  const status = await getKeyStatus();
  if (status.fake) console.log("[parlament] Offline fake mode (PARLAMENT_FAKE=1): no API calls.");
  else {
    for (const [name, s] of [
      ["Claude", status.providers.anthropic],
      ["Gemini", status.providers.google],
    ] as const) {
      if (s.ok) console.log(`[parlament] ${name}: key OK.`);
      else if (s.missing) console.log(`[parlament] ${name}: no key (models greyed out in the picker).`);
      else console.error(`[parlament] ${name}: key check failed: ${s.error}`);
    }
    if (status.geminiModels) console.log(`[parlament] Gemini models: ${status.geminiModels.map((m) => m.id).join(", ")}`);
  }
  const members = getMembers();
  if (!members.ok) console.error(`[parlament] Member files: ${members.error}`);
  else console.log(`[parlament] ${members.members.length} members loaded: ${members.members.map((m) => m.short).join(", ")}`);
}
