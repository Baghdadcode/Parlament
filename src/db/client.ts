import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getDbPath } from "../config/env";
import * as schema from "./schema";

export type ParlamentDb = Awaited<ReturnType<typeof openDb>>;

/**
 * Opens (and migrates) the local SQLite file with Node's built-in `node:sqlite` (Node 22.13+), so there is no
 * native addon to compile or crash. Drizzle talks to it through its sqlite-proxy driver. Pass ":memory:" in tests.
 */
export async function openDb(path: string = getDbPath()) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      const args = params as SQLInputValue[];
      if (method === "run") {
        stmt.run(...args);
        return { rows: [] };
      }
      // Drizzle's proxy driver expects rows as arrays of column values; node:sqlite returns objects whose keys
      // follow column order.
      if (method === "get") {
        const row = stmt.get(...args);
        return { rows: row ? Object.values(row) : (undefined as unknown as unknown[]) };
      }
      return { rows: stmt.all(...args).map((row) => Object.values(row)) };
    },
    { schema },
  );

  await migrate(
    db,
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        for (const q of queries) sqlite.exec(q);
        sqlite.exec("COMMIT");
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
    { migrationsFolder: "./drizzle" },
  );
  return db;
}
