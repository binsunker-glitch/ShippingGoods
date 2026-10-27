import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 *
 * The session is carried in httpOnly cookies managed by `@supabase/ssr`. In
 * Server Actions and Route Handlers we can write cookies; in Server Components
 * the cookie store is read-only, so `setAll` swallows that error and the
 * root `middleware.ts` refreshes the session instead.
 *
 * Queries made with this client run as the signed-in user, so Row Level
 * Security is enforced by the database for every read and write.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // The middleware handles the refresh; safe to ignore here.
        }
      },
    },
    auth: {
      // The access token is short-lived; @supabase/ssr refreshes it via the
      // refresh token stored in the cookie.
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
