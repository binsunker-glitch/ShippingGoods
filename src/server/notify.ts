import "server-only";

import { createClient } from "@/lib/supabase/server";

export type NotificationInput = {
  customerId: string;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "danger";
  link?: string | null;
};

/**
 * Stores a customer notification via the `create_notification` SECURITY DEFINER
 * function. The database only allows a caller to notify themselves, or — for
 * staff-initiated updates — any customer. Customers can never notify others.
 */
export async function createNotification(input: NotificationInput): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_notification", {
    p_customer_id: input.customerId,
    p_title: input.title,
    p_message: input.message,
    p_type: input.type ?? "info",
    p_link: input.link ?? null,
  });
  if (error) {
    console.error("[notify] failed to create notification", error.message);
    return "";
  }
  return (data as string) ?? "";
}
