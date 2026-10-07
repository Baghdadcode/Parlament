import { defineConfig } from "@playwright/test";
import { cpSync, existsSync, rmSync } from "node:fs";

// Browser tests run the real app in offline fake mode: no API key, no cost. They work on a copy of the member files,
// so creating your own members in a test never touches members/.
const membersCopy = "./data/e2e-members";
rmSync(membersCopy, { recursive: true, force: true });
cpSync("./members", membersCopy, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3123", launchOptions: executablePath ? { executablePath } : {} },
  webServer: {
    command: "npx next dev -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PARLAMENT_FAKE: "1", PARLAMENT_DB_PATH: "./data/e2e.db", PARLAMENT_MEMBERS_DIR: membersCopy, NEXT_TELEMETRY_DISABLED: "1" },
  },
});
