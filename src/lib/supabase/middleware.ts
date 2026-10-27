import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Refreshes the Supabase auth session (access token) on every request and
 * returns the response carrying any updated session cookies, plus the resolved
 * user (or null).
 *
 * Runs in the Edge middleware, so it must not touch the application database —
 * only the Supabase Auth API. Coarse "is this visitor signed in?" gating lives
 * in the root `middleware.ts`; role/permission checks stay in the server guards.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run any code between createServerClient() and getUser() —
  // it can cause hard-to-debug session desynchronisation.
  let user: { id: string } | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch {
    user = null;
  }

  return { supabaseResponse, user };
}
