import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db/client";
import { siteSettings } from "@/db/schema";

/** Reads one configurable value (contact info, policies, FAQ, warehouse notes). */
export async function getSiteSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1);
  return (rows[0]?.value as T | undefined) ?? null;
}

/** All settings at once (used by the public homepage). */
export const getAllSettings = cache(async (): Promise<Record<string, Record<string, unknown>>> => {
  const db = await getDb();
  const rows = await db.select().from(siteSettings);
  const result: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    result[row.key] = (row.value ?? {}) as Record<string, unknown>;
  }
  return result;
});
