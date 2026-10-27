import "server-only";

import { cache } from "react";
import { connection } from "next/server";

import type { AccountStatus, ProfileRole } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * The application-wide session shape.
 *
 * It is intentionally unchanged from the pre-Supabase implementation so that
 * every guard, server action, and query keeps working while the *identity
 * provider* underneath is now Supabase Auth.
 *
 * `profileId` is the Supabase Auth user id (`auth.users.id`), which is also the
 * primary key of `public.profiles`.
 */
export type Session = {
  sessionId: string;
  profileId: string;
  role: ProfileRole;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string;
  accountStatus: AccountStatus;
};

type ProfileRow = {
  id: string;
  customer_number: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  account_status: string | null;
};

/**
 * Resolves the signed-in user from the Supabase session cookie and builds the
 * app `Session`. The profile and role are read through the RLS-enforced client,
 * so a user can only ever see their own row.
 *
 * Returns `null` for anonymous visitors and for suspended/closed accounts.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // Marks guarded routes as request-time so the Cache Components prerender pass
  // never opens the database (see guards.ts for the full rationale).
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, customer_number, full_name, phone, email, city, account_status")
    .eq("id", user.id)
    .maybeSingle();

  // Fallback for the rare case where profile provisioning has not completed yet
  // (see `handle_new_user()` / `repair_missing_profiles()` in the migrations).
  // We synthesise a minimal session from the Auth metadata rather than crash.
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const profile: ProfileRow = {
    id: user.id,
    customer_number: profileRow?.customer_number ?? null,
    full_name: profileRow?.full_name ?? meta.full_name ?? null,
    phone: profileRow?.phone ?? meta.phone ?? null,
    email: profileRow?.email ?? user.email ?? null,
    city: profileRow?.city ?? meta.city ?? null,
    account_status: profileRow?.account_status ?? "active",
  };

  // A user with no row in `user_roles` is a regular customer.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const role = (roleRows?.[0]?.role ?? "customer") as ProfileRole;

  const accountStatus = (profile.account_status ?? "active") as AccountStatus;
  if (accountStatus !== "active") return null;

  return {
    sessionId: user.id,
    profileId: user.id,
    role,
    customerNumber: profile.customer_number ?? "—",
    fullName: profile.full_name ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? null,
    city: profile.city ?? "",
    accountStatus,
  };
});

export async function getIpAddress(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
    return headerStore.get("x-real-ip") ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function getUserAgent(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    return headerStore.get("user-agent");
  } catch {
    return null;
  }
}
