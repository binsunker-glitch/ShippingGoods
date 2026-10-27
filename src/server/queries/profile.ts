import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Minimal profile lookup used by the account page.
 *
 * Runs through the RLS-enforced client, so a caller can only ever read the
 * profile they own. The role is resolved from `user_roles` (a user with no row
 * there is a regular customer).
 */
export async function getProfile(profileId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, customer_number, full_name, phone, email, city, account_status, created_at")
    .eq("id", profileId)
    .maybeSingle();

  if (!data) return null;

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profileId)
    .maybeSingle();

  return {
    id: data.id,
    customerNumber: data.customer_number,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    city: data.city,
    role: (roleRow?.role ?? "customer") as string,
    accountStatus: data.account_status,
    createdAt: data.created_at as string,
  };
}
