import { defineConfig } from "vitest/config";

// Used by `npm run test:live`. Sets LIVE through config instead of the shell, so it works in PowerShell,
// cmd and bash alike.
export default defineConfig({
  test: { include: ["tests/live.test.ts"], env: { LIVE: "1" }, testTimeout: 600_000 },
});
