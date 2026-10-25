import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { getDb } from "@/db/client";
import { profiles, sessions } from "@/db/schema";
import type { AccountStatus, ProfileRole } from "@/db/schema";

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

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "wa_session";
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function maxAgeSeconds(): number {
  return Math.max(60, TTL_DAYS * 24 * 60 * 60);
}

/**
 * Resolves the current session from the httpOnly cookie.
 * Never exposes the raw token to the database layer (only its SHA-256 hash).
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const db = await getDb();
  const tokenHash = sha256(token);

  const rows = await db
    .select({
      sessionId: sessions.id,
      profileId: sessions.profileId,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      fullName: profiles.fullName,
      phone: profiles.phone,
      email: profiles.email,
      city: profiles.city,
      role: profiles.role,
      customerNumber: profiles.customerNumber,
      accountStatus: profiles.accountStatus,
    })
    .from(sessions)
    .innerJoin(profiles, eq(sessions.profileId, profiles.id))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = new Date();
  const expiresAt = new Date(row.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return null;
  }
  if (row.accountStatus !== "active") {
    return null;
  }

  return {
    sessionId: row.sessionId,
    profileId: row.profileId,
    role: row.role,
    customerNumber: row.customerNumber,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    city: row.city,
    accountStatus: row.accountStatus,
  };
});

/** Creates a session and stores the raw token only in the browser cookie. */
export async function createSession(profileId: string, userAgent?: string | null): Promise<void> {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxAgeSeconds() * 1000);

  await db.insert(sessions).values({
    id: randomUUID(),
    profileId,
    tokenHash: sha256(token),
    createdAt: now,
    expiresAt,
    lastSeenAt: now,
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds(),
  });
}

/** Revokes every active session of a profile (logout, password reset, suspension). */
export async function revokeSessions(profileId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.profileId, profileId), isNull(sessions.revokedAt)));
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const db = await getDb();
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, sha256(token)));
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getIpAddress(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headerStore.get("x-real-ip") ?? "unknown";
}

export async function getUserAgent(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get("user-agent");
}

export { COOKIE_NAME };
