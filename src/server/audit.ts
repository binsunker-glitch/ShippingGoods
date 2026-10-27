import "server-only";

import { createClient } from "@/lib/supabase/server";

const SENSITIVE_KEY = /(password|token|secret|cookie|authorization|cvv|card_number|otp)/i;

/** Removes anything that must never appear in an audit trail. */
function sanitize(metadata?: Record<string, unknown>): Record<string, unknown> | null {
  if (!metadata) return null;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    if (value instanceof Date) output[key] = value.toISOString();
    else if (value === null || ["string", "number", "boolean"].includes(typeof value))
      output[key] = value;
    else output[key] = String(value);
  }
  return output;
}

export type AuditInput = {
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Appends an immutable audit record through the `log_audit` SECURITY DEFINER
 * function (see the migrations). The database always records the actor as
 * `auth.uid()` — a client can never impersonate another actor. Sensitive keys
 * are redacted here *and* again inside the function.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_audit", {
      p_action: input.action,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId ?? null,
      p_metadata: sanitize(input.metadata),
    });
  } catch (error) {
    // Auditing must never break the primary operation, but failures are loud.
    console.error("[audit] failed to write audit log", error);
  }
}
