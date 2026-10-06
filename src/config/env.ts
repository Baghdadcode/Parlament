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

export class MissingGeminiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY saknas. Lägg en nyckel från aistudio.google.com i .env.local (se .env.example) för att använda Gemini.");
    this.name = "MissingGeminiKeyError";
  }
}

/** Gemini Developer API key (GEMINI_API_KEY, or GOOGLE_API_KEY as the Google SDKs also accept). */
export function getGeminiApiKey(): string {
  loadEnv();
  const key = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY)?.trim();
  if (!key) throw new MissingGeminiKeyError();
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
