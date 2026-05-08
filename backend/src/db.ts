import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env.js";

// Ensure the parent directory exists. Important for first-run with a path
// like ./tmp/dev.db or /data/service-status.db.
const dbPath = path.resolve(env.databasePath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db: Database.Database = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// Postgres-flavored async wrapper. Keeps existing route call sites unchanged
// (they still do `await pool.query(sql, params)` and read `.rows`).
//
// Conversion strategy:
//   1. Translate Postgres `$N` placeholders → SQLite `:pN` named params.
//   2. Bind a single object `{p1: ..., p2: ...}` rather than a positional
//      array. This handles queries that reuse a placeholder (e.g. multi-row
//      VALUES that share a subject id).
//   3. Coerce booleans to 0/1, undefined to null, Date to ISO string.

function toSqlite(sql: string): string {
  return sql.replace(/\$(\d+)/g, ":p$1");
}

function bindParams(params: readonly unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  params.forEach((v, i) => {
    let bound: unknown = v;
    if (typeof v === "boolean") bound = v ? 1 : 0;
    else if (v === undefined) bound = null;
    else if (v instanceof Date) bound = v.toISOString();
    obj["p" + (i + 1)] = bound;
  });
  return obj;
}

export type QueryResult<T> = { rows: T[]; rowCount: number };

async function query<T = Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  const sqliteSql = toSqlite(sql);
  const bound = bindParams(params);
  const stmt = db.prepare(sqliteSql);

  // `reader` is true for SELECTs and INSERT/UPDATE/DELETE … RETURNING — both
  // cases that produce row output.
  if (stmt.reader) {
    const rows = (Object.keys(bound).length === 0
      ? stmt.all()
      : stmt.all(bound)) as T[];
    return { rows, rowCount: rows.length };
  }
  const info =
    Object.keys(bound).length === 0 ? stmt.run() : stmt.run(bound);
  return { rows: [], rowCount: info.changes };
}

export const pool = { query };
export type Queryable = typeof pool;

// Manual BEGIN/COMMIT around an async callback. better-sqlite3's native
// `db.transaction(fn)` is synchronous and cannot span awaits, so we manage
// the transaction commands ourselves. Safe for our workload (single-process,
// low concurrency); not a substitute for a real connection-per-transaction
// pool if we ever moved to multi-process.
export async function withTransaction<T>(
  fn: (q: Queryable) => Promise<T>,
): Promise<T> {
  db.exec("BEGIN");
  try {
    const result = await fn(pool);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore — the outer error is what matters
    }
    throw err;
  }
}
