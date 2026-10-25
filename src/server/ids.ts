import "server-only";

import { eq, sql } from "drizzle-orm";

import { sequences } from "@/db/schema";
import type { Tx } from "@/db/client";

/**
 * Server side sequence generation.
 *
 * `UPDATE ... RETURNING` holds a row lock on the counter until the surrounding
 * transaction commits, so two concurrent registrations can never receive the
 * same number. The UNIQUE indexes on the human readable identifiers are the
 * second line of defence.
 */

async function nextSequenceValue(tx: Tx, key: string, initial: number, attempt = 0): Promise<number> {
  const rows = await tx
    .update(sequences)
    .set({ value: sql`${sequences.value} + 1` })
    .where(eq(sequences.key, key))
    .returning({ value: sequences.value });

  const row = rows[0];
  if (row) return row.value;

  if (attempt > 2) {
    throw new Error(`sequence "${key}" could not be generated`);
  }

  await tx
    .insert(sequences)
    .values({ key, value: initial })
    .onConflictDoNothing({ target: sequences.key });

  return nextSequenceValue(tx, key, initial, attempt + 1);
}

/** WA-100001, WA-100002, ... (starts at 100001, permanent, never reused). */
export async function nextCustomerNumber(tx: Tx): Promise<string> {
  const value = await nextSequenceValue(tx, "profiles", 100000);
  return `WA-${value}`;
}

/** WAS-2026-000001 — unique per shipment. */
export async function nextTrackingNumber(tx: Tx): Promise<string> {
  const value = await nextSequenceValue(tx, "shipments", 0);
  const year = new Date().getUTCFullYear();
  return `WAS-${year}-${String(value).padStart(6, "0")}`;
}

/** WAP-2026-000001 — unique per warehouse package. */
export async function nextPackageReference(tx: Tx): Promise<string> {
  const value = await nextSequenceValue(tx, "packages", 0);
  const year = new Date().getUTCFullYear();
  return `WAP-${year}-${String(value).padStart(6, "0")}`;
}

/** WAC-2026-000001 — unique per consolidation group. */
export async function nextConsolidationReference(tx: Tx): Promise<string> {
  const value = await nextSequenceValue(tx, "consolidation", 0);
  const year = new Date().getUTCFullYear();
  return `WAC-${year}-${String(value).padStart(6, "0")}`;
}

/** SUP-2026-000001 — unique per support ticket. */
export async function nextTicketNumber(tx: Tx): Promise<string> {
  const value = await nextSequenceValue(tx, "tickets", 0);
  const year = new Date().getUTCFullYear();
  return `SUP-${year}-${String(value).padStart(6, "0")}`;
}

/** Postgres unique violation code, used for retry logic. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
}
