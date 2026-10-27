import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Client Components (runs in the browser).
 *
 * Uses the publishable (anon) key only. All data access from the browser is
 * protected by Row Level Security defined in `supabase/migrations/0003_rls.sql`.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
