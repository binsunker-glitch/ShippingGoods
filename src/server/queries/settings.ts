import "server-only";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Reads one configurable value (contact info, policies, FAQ, warehouse notes). */
export async function getSiteSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

/** All settings at once (used by the public homepage). Runs through RLS (select to authenticated). */
export const getAllSettings = cache(async (): Promise<Record<string, Record<string, unknown>>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("site_settings").select("key, value");

  const result: Record<string, Record<string, unknown>> = {};
  for (const row of data ?? []) {
    result[row.key] = (row.value ?? {}) as Record<string, unknown>;
  }
  return result;
});
