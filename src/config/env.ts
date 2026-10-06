import { config } from "dotenv";

let loaded = false;

/** Loads .env.local (server side only). The key is never logged or returned to clients. */
export function loadEnv(): void {
  if (loaded) return;
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  loaded = true;
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY saknas. Skapa .env.local (se .env.example) med en API-nyckel från console.anthropic.com. " +
        "Ett Claude.ai-abonnemang fungerar inte mot API:t.",
    );
    this.name = "MissingApiKeyError";
  }
}

export function getApiKey(): string {
  loadEnv();
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new MissingApiKeyError();
  return key;
}

export function getDbPath(): string {
  loadEnv();
  return process.env.PARLAMENT_DB_PATH ?? "./data/parlament.db";
}

/** Folder with one .md file per member. */
export function getMembersDir(): string {
  loadEnv();
  return process.env.PARLAMENT_MEMBERS_DIR ?? "./members";
}
