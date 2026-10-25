import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { requireCustomer } from "@/server/auth/guards";
import { PortalChrome } from "@/components/portal/portal-chrome";
import type { ReactNode } from "react";

/**
 * Reads the session once for the whole portal, enforces authentication and
 * renders the shared frame. Every child page inherits this guard.
 */
export async function PortalShell({ children }: { children: ReactNode }) {
  // The session read inside requireCustomer() calls connection(), so this whole
  // auth-gated frame renders at request time and is never prerendered.
  const session = await requireCustomer();
  const db = await getDb();

  const unreadRows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.customerId, session.profileId), isNull(notifications.readAt)));

  return (
    <PortalChrome
      user={{
        fullName: session.fullName,
        customerNumber: session.customerNumber,
        role: session.role,
      }}
      unreadCount={Number(unreadRows[0]?.value ?? 0)}
    >
      {children}
    </PortalChrome>
  );
}
