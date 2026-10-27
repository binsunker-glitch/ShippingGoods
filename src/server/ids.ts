import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Human-readable identifier generation, delegated to concurrency-safe
 * PostgreSQL functions (`gen_*`, SECURITY DEFINER) that atomically increment
 * the `sequences` counters. The UNIQUE indexes on these columns are the second
 * line of defence against races.
 */

/** WAS-2026-000001 — unique per shipment. */
export async function nextTrackingNumber(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gen_tracking_number");
  if (error || !data) throw new Error(error?.message || "tracking number could not be generated");
  return data as string;
}

/** PKG-000001 — unique per warehouse package (DB enforces the format). */
export async function nextPackageReference(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gen_package_reference");
  if (error || !data) throw new Error(error?.message || "package reference could not be generated");
  return data as string;
}

/** TKT-000001 — unique per support ticket (DB enforces the format). */
export async function nextTicketNumber(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gen_ticket_number");
  if (error || !data) throw new Error(error?.message || "ticket number could not be generated");
  return data as string;
}

/** Postgres unique-violation code (23505), used for retry/conflict logic. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "23505";
}
