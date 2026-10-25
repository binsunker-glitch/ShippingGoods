import fs from "node:fs";
import path from "node:path";

/** Minimal `.env` loader so the scripts work without any extra dependency. */
export function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

/**
 * Connects to the same database the application uses:
 * PostgreSQL when DATABASE_URL is set, embedded PGlite otherwise.
 */
export async function connect() {
  const url = process.env.DATABASE_URL;

  if (url && url.trim().length > 0) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1 });
    return {
      kind: "postgres",
      async query(text, params) {
        return pool.query(text, params);
      },
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn((text, params) => client.query(text, params));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.resolve(process.env.PGLITE_DATA_DIR ?? ".data");
  fs.mkdirSync(dir, { recursive: true });
  const pglite = new PGlite(dir);
  await pglite.waitReady;
  return {
    kind: "pglite",
    async query(text, params) {
      return pglite.query(text, params);
    },
    async tx(fn) {
      return pglite.transaction((tx) => fn((text, params) => tx.query(text, params)));
    },
    async close() {
      await pglite.close();
    },
  };
}
