import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { profiles } from "@/db/schema";

/** Minimal profile lookup used by the account page (owner-scoped). */
export async function getProfile(profileId: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: profiles.id,
      customerNumber: profiles.customerNumber,
      fullName: profiles.fullName,
      phone: profiles.phone,
      email: profiles.email,
      city: profiles.city,
      role: profiles.role,
      accountStatus: profiles.accountStatus,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return rows[0] ?? null;
}
