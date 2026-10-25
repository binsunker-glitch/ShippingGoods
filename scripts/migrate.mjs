import fs from "node:fs";
import path from "node:path";
import { connect, loadEnv } from "./lib-db.mjs";

/**
 * Applies the generated SQL migrations from `drizzle/` in order.
 *
 * Idempotent: already applied tags are skipped, so it is safe to run before
 * `next dev` and `next build`.
 */
async function main() {
  loadEnv();
  const db = await connect();

  await db.query(`
    CREATE TABLE IF NOT EXISTS "__wa_migrations" (
      tag text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const appliedResult = await db.query(`SELECT tag FROM "__wa_migrations"`);
  const applied = new Set(appliedResult.rows.map((row) => row.tag));

  let ran = 0;
  for (const entry of journal.entries) {
    if (applied.has(entry.tag)) continue;
    const file = path.resolve(process.cwd(), "drizzle", `${entry.tag}.sql`);
    const sql = fs.readFileSync(file, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await db.query(statement);
    }
    await db.query(`INSERT INTO "__wa_migrations" (tag) VALUES ($1) ON CONFLICT DO NOTHING`, [
      entry.tag,
    ]);
    ran += 1;
    console.log(`  applied ${entry.tag}`);
  }

  await db.close();
  console.log(
    ran === 0
      ? `[db] database is up to date (${db.kind})`
      : `[db] applied ${ran} migration(s) (${db.kind})`,
  );
}

main().catch((error) => {
  console.error("[db] migration failed:", error);
  process.exitCode = 1;
});
