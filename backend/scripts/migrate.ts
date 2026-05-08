import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../src/db.js";

// Resolve from cwd so this works in both layouts: local (run from backend/)
// and the prod container (WORKDIR /app, with /app/migrations alongside dist/).
const migrationsDir = path.resolve(process.cwd(), "migrations");

function ensureMigrationsTable(): void {
  // The first migration creates the canonical table; this guard handles
  // re-runs and the bootstrap case where no migrations have been applied yet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);
}

function appliedFilenames(): Set<string> {
  const rows = db
    .prepare<unknown[], { filename: string }>(
      "SELECT filename FROM schema_migrations",
    )
    .all();
  return new Set(rows.map((r) => r.filename));
}

async function run(): Promise<void> {
  ensureMigrationsTable();
  const applied = appliedFilenames();

  const all = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = all.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log("[migrate] no pending migrations");
    return;
  }

  for (const filename of pending) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
    console.log(`[migrate] applying ${filename}`);
    // Wrap in a transaction so a partial migration rolls back cleanly.
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare(
        "INSERT OR IGNORE INTO schema_migrations (filename) VALUES (?)",
      ).run(filename);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  console.log(`[migrate] applied ${pending.length} migration(s)`);
}

run()
  .then(() => db.close())
  .catch((err) => {
    console.error("[migrate] failed", err);
    db.close();
    process.exit(1);
  });
