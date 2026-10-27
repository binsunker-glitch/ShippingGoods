import "server-only";

import type { ReactNode } from "react";

import { requireCustomer } from "@/server/auth/guards";
import { getUnreadNotificationCount } from "@/server/queries/customer";
import { PortalChrome } from "@/components/portal/portal-chrome";

/**
 * Reads the session once for the whole portal, enforces authentication and
 * renders the shared frame. Every child page inherits this guard.
 */
export async function PortalShell({ children }: { children: ReactNode }) {
  // The session read inside requireCustomer() calls connection(), so this whole
  // auth-gated frame renders at request time and is never prerendered.
  const session = await requireCustomer();
  const unreadCount = await getUnreadNotificationCount(session.profileId);

  return (
    <PortalChrome
      user={{
        fullName: session.fullName,
        customerNumber: session.customerNumber,
        role: session.role,
      }}
      unreadCount={unreadCount}
    >
      {children}
    </PortalChrome>
  );
}
