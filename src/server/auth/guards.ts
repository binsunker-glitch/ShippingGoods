import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";

import { can, isAdminRole, type Permission } from "@/lib/permissions";
import { getSession, type Session } from "./session";

/**
 * Returns the session or redirects anonymous visitors to the login page.
 *
 * `connection()` marks every route guarded by this family as request-time.
 * These pages read the session (and usually the database) per request, so the
 * dev prerender-validation pass must not attempt to prerender them — doing so
 * opens the embedded database, which reads Date.now() internally and reports an
 * unstable value. Actions use the `*Action` guards below, which never call this.
 */
export async function requireSession(): Promise<Session> {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Customer portal guard: authenticated non-staff accounts only. */
export async function requireCustomer(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "customer") redirect("/admin");
  return session;
}

/** Admin console guard: staff roles only. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isAdminRole(session.role)) redirect("/dashboard");
  return session;
}

/** Admin console guard with a granular permission check. */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  if (!isAdminRole(session.role)) redirect("/dashboard");
  if (!can(session.role, permission)) redirect("/admin/unauthorized");
  return session;
}

/**
 * Guard used inside Server Actions where a redirect would be wrong.
 * Returns `null` instead of throwing when the caller is anonymous.
 */
export async function sessionOrNull(): Promise<Session | null> {
  return getSession();
}

export async function requireCustomerAction(): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.role !== "customer") return null;
  return session;
}

export async function requirePermissionAction(
  permission: Permission,
): Promise<Session | null> {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) return null;
  if (!can(session.role, permission)) return null;
  return session;
}

export { getSession };
