import "server-only";

import { randomUUID } from "node:crypto";

import { getDb } from "@/db/client";
import type { Tx } from "@/db/client";
import { notifications } from "@/db/schema";

export type NotificationInput = {
  customerId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "danger";
  link?: string | null;
};

/** Stores a customer notification (rendered in the portal bell + /notifications). */
export async function createNotification(
  input: NotificationInput,
  tx?: Tx,
): Promise<string> {
  const executor = tx ?? (await getDb());
  const id = randomUUID();
  await executor.insert(notifications).values({
    id,
    customerId: input.customerId,
    title: input.title,
    message: input.message,
    notificationType: input.type ?? "info",
    link: input.link ?? null,
  });
  return id;
}
