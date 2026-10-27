import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/** Customer portal sections that require a signed-in user. */
const PROTECTED_PORTAL = [
  "/dashboard",
  "/shipments",
  "/link-shipment",
  "/addresses",
  "/packages",
  "/consolidation",
  "/payments",
  "/notifications",
  "/help",
  "/account",
  "/welcome",
];

/** Admin console (role checks happen in the server guards). */
const PROTECTED_ADMIN = ["/admin"];

/** Pages only anonymous visitors should see; signed-in users are forwarded. */
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

function isProtected(pathname: string): boolean {
  return (
    PROTECTED_PORTAL.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PROTECTED_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Protected area but not signed in -> send to the login page with the
  // intended destination preserved.
  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return Response.redirect(url, 307);
  }

  // Already signed in but on an auth page -> forward to their landing page.
  if (user && isAuthPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return Response.redirect(url, 307);
  }

  return supabaseResponse;
}

export const config = {
  // Run on everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
