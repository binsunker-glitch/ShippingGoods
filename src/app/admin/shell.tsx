import "server-only";

import type { ReactNode } from "react";

import { requireAdmin } from "@/server/auth/guards";
import { permissionsFor } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { AdminChrome } from "./chrome";

/**
 * Reads the session once for the whole admin console, enforces that the actor
 * holds a staff role, and renders the frame with only the permissions the
 * actor's role actually has. Child pages re-check their own permission.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  // The session read inside requireAdmin() calls connection(), so this whole
  // auth-gated frame renders at request time and is never prerendered.
  const session = await requireAdmin();

  return (
    <AdminChrome
      user={{
        fullName: session.fullName,
        customerNumber: session.customerNumber,
        role: session.role,
        roleLabel: ROLE_LABELS[session.role] ?? session.role,
      }}
      allowedPermissions={permissionsFor(session.role)}
    >
      {children}
    </AdminChrome>
  );
}
