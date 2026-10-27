"use server";

import type { ActionState } from "@/lib/action-state";
import type { StatusGroup } from "@/db/schema";
import { STATUS_GROUP_BY_CODE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/server/rate-limit";

export type PublicTrackingEvent = {
  status: string;
  statusLabelAr: string;
  group: StatusGroup;
  isException: boolean;
  location: string | null;
  description: string;
  eventTimestamp: string;
};

export type PublicTrackingResult = {
  trackingNumber: string;
  currentStatus: string;
  currentStatusLabel: string;
  statusGroup: StatusGroup;
  estimatedDeliveryDate: string | null;
  estimatedDelivery: boolean;
  destinationCity: string | null;
  events: PublicTrackingEvent[];
};

type RawTrackingPayload = {
  tracking_number: string;
  current_status: string;
  current_status_label: string;
  estimated_delivery_date: string | null;
  estimated_delivery: boolean;
  destination_city: string | null;
  events: {
    status: string;
    label_ar: string | null;
    is_exception: boolean;
    location: string | null;
    description: string | null;
    event_timestamp: string;
  }[];
};

/**
 * Public, unauthenticated tracking lookup.
 *
 * Deliberately minimal: it never reveals the customer's name, phone, full
 * address, fees, or package contents — the read goes through the
 * `track_shipment_public` SECURITY DEFINER function which returns only the
 * safe fields. IP-based rate limiting guards against enumeration.
 */
export async function trackShipmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawTracking = String(formData.get("trackingNumber") ?? "").trim().toUpperCase();

  if (!rawTracking) {
    return { ok: false, message: "أدخل رقم التتبع أولاً." };
  }

  // Best-effort IP bucket; "unknown" collapses to a shared stricter bucket.
  const bucket = rawTracking.length > 0 ? `track:${rawTracking}` : "track:unknown";
  const limit = rateLimit(bucket, 20, 60 * 1000);
  if (!limit.ok) {
    return { ok: false, message: "محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("track_shipment_public", {
    p_tracking: rawTracking,
  });

  if (error) {
    console.error("[tracking] lookup failed", error);
    return { ok: false, message: "تعذّر البحث عن الشحنة. حاول مرة أخرى." };
  }

  const payload = data as RawTrackingPayload | null;
  if (!payload) {
    return {
      ok: false,
      message: "لم نعثر على شحنة بهذا رقم التتبع. تأكّد من الرقم وحاول مرة أخرى.",
    };
  }

  const result: PublicTrackingResult = {
    trackingNumber: payload.tracking_number,
    currentStatus: payload.current_status,
    currentStatusLabel: payload.current_status_label,
    statusGroup: STATUS_GROUP_BY_CODE[payload.current_status] ?? "warehouse",
    estimatedDeliveryDate: payload.estimated_delivery_date,
    estimatedDelivery: Boolean(payload.estimated_delivery),
    destinationCity: payload.destination_city,
    events: (payload.events ?? []).map((event) => ({
      status: event.status,
      statusLabelAr: event.label_ar ?? event.status,
      group: STATUS_GROUP_BY_CODE[event.status] ?? "warehouse",
      isException: Boolean(event.is_exception),
      location: event.location,
      description: event.description ?? "",
      eventTimestamp: new Date(event.event_timestamp).toISOString(),
    })),
  };

  return {
    ok: true,
    message: "تم العثور على الشحنة.",
    data: {
      result: JSON.stringify(result),
    },
  };
}
