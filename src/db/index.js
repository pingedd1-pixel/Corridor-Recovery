// One tiny adapter over `pg` (DATABASE_URL set) or PGlite (embedded, dev/test).
// Both expose: query(text, params) -> {rows}, exec(sqlText), close().
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export async function openDb({ url = process.env.DATABASE_URL, pgliteDir = process.env.PGLITE_DIR, memory = false } = {}) {
  if (url && !memory) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false } });
    return { kind: "pg", query: (t, p = []) => pool.query(t, p), exec: t => pool.query(t), close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = pgliteDir || "./data/pglite"; if (!memory) mkdirSync(dir, { recursive: true });
  const db = memory ? new PGlite() : new PGlite(dir);
  await db.waitReady;
  return { kind: "pglite", query: (t, p = []) => db.query(t, p), exec: t => db.exec(t), close: () => db.close() };
}

export async function migrate(db, log = () => {}) {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query("SELECT name FROM schema_migrations")).rows.map(r => r.name));
  const dir = join(here, "migrations");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    await db.exec("BEGIN");
    try { await db.exec(sql); await db.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]); await db.exec("COMMIT"); }
    catch (e) { await db.exec("ROLLBACK"); throw new Error(`migration ${f} failed: ${e.message}`); }
    applied.push(f); log(`applied ${f}`);
  }
  return applied;
}

export const num = v => v == null || v === "" ? null : Number(v);
export const dateStr = v => v == null ? "" : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
