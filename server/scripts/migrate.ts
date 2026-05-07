import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "../src/db.js";

// Resolve from cwd so this works in both layouts: local (run from server/)
// and the prod container (WORKDIR /app, with /app/migrations alongside dist/).
const migrationsDir = path.resolve(process.cwd(), "migrations");

async function ensureMigrationsTable(): Promise<void> {
  // The first migration creates the canonical table; this guard handles
  // re-runs and the bootstrap case where no migrations have been applied yet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedFilenames(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  return new Set(rows.map((r) => r.filename));
}

async function run(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedFilenames();

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
    const client = await pool.connect();
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
        [filename],
      );
    } finally {
      client.release();
    }
  }

  console.log(`[migrate] applied ${pending.length} migration(s)`);
}

run()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[migrate] failed", err);
    pool.end().finally(() => process.exit(1));
  });
