/** Applies db/migrations/*.sql in order, once each. Safe to run on every deploy. */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { closePool, pool } from "../src/server/db";

async function main() {
  const dir = join(process.cwd(), "db", "migrations");
  const client = await pool().connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      process.stdout.write(`Applying ${f} … `);
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log("done");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log("Database is up to date.");
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
