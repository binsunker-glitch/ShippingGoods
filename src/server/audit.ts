import "server-only";

import { randomUUID } from "node:crypto";

import { getDb } from "@/db/client";
import type { Tx } from "@/db/client";
import { auditLogs } from "@/db/schema";

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
 * Appends an immutable audit record. Every sensitive operation
 * (status change, ownership change, payment, role change) must call this.
 */
export async function logAudit(input: AuditInput, tx?: Tx): Promise<void> {
  const executor = tx ?? (await getDb());
  await executor.insert(auditLogs).values({
    id: randomUUID(),
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: sanitize(input.metadata),
  });
}
