import "server-only";

import fs from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type {
  PgDatabase,
  PgQueryResultHKT,
  PgTransaction,
} from "drizzle-orm/pg-core";

/**
 * Single database entry point.
 *
 * - `DATABASE_URL` set        -> real PostgreSQL (Supabase / any Postgres).
 * - `DATABASE_URL` empty      -> embedded PostgreSQL (PGlite) stored in `.data/`,
 *                                so local development works with zero services.
 *
 * Both drivers share the PostgreSQL dialect, therefore the generated SQL
 * migrations are identical in development and production.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<PgQueryResultHKT, any, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = PgTransaction<PgQueryResultHKT, any, any>;

type GlobalWithDb = typeof globalThis & {
  __waDatabase?: Promise<Database>;
  __waPglite?: PGlite;
};

const globals = globalThis as GlobalWithDb;

async function createDatabase(): Promise<Database> {
  const url = process.env.DATABASE_URL;

  if (url && url.trim().length > 0) {
    const pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: /(\?|&)sslmode=(require|verify-full)/.test(url)
        ? { rejectUnauthorized: false }
        : undefined,
    });
    pool.on("error", (error) => {
      console.error("[db] unexpected postgres pool error", error);
    });
    return drizzleNodePg(pool);
  }

  const dir = path.resolve(process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data"));
  fs.mkdirSync(dir, { recursive: true });
  const pglite = new PGlite(dir);
  globals.__waPglite = pglite;
  return drizzlePglite(pglite);
}

/** Returns the shared database client (re-used across hot reloads). */
export function getDb(): Promise<Database> {
  if (!globals.__waDatabase) {
    globals.__waDatabase = createDatabase();
  }
  return globals.__waDatabase;
}

/**
 * Runs `fn` inside a database transaction. All multi-row invariants
 * (identifier generation, shipment claiming, status changes) must go through
 * this helper so that a failure rolls the whole operation back.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

/** Reads a database row with row level locking (used by sequence generation). */
export async function transactionWithLock<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTransaction(fn);
}

export async function closeDatabase(): Promise<void> {
  const pglite = globals.__waPglite;
  globals.__waDatabase = undefined;
  globals.__waPglite = undefined;
  if (pglite) {
    await pglite.close();
  }
}
