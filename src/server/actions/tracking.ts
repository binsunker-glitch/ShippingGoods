"use server";

import { asc, eq } from "drizzle-orm";

import type { ActionState } from "@/lib/action-state";
import { getDb } from "@/db/client";
import { shipmentEvents, shipments } from "@/db/schema";
import type { StatusGroup } from "@/db/schema";
import { rateLimit } from "@/server/rate-limit";
import { getStatusCatalog } from "@/server/queries/statuses";

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

/**
 * Public, unauthenticated tracking lookup.
 *
 * Deliberately minimal: it never reveals the customer's name, phone, full
 * address, fees, or package contents. IP-based rate limiting guards against
 * enumeration of tracking numbers.
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

  const db = await getDb();
  const rows = await db
    .select({
      id: shipments.id,
      trackingNumber: shipments.trackingNumber,
      currentStatus: shipments.currentStatus,
      statusGroup: shipments.statusGroup,
      estimatedDeliveryDate: shipments.estimatedDeliveryDate,
      estimatedDelivery: shipments.estimatedDelivery,
      destinationCity: shipments.destinationCity,
    })
    .from(shipments)
    .where(eq(shipments.trackingNumber, rawTracking))
    .limit(1);

  const shipment = rows[0];
  if (!shipment) {
    return {
      ok: false,
      message: "لم نعثر على شحنة بهذا رقم التتبع. تأكّد من الرقم وحاول مرة أخرى.",
    };
  }

  const [eventRows, catalog] = await Promise.all([
    db
      .select({
        status: shipmentEvents.status,
        statusGroup: shipmentEvents.statusGroup,
        location: shipmentEvents.location,
        description: shipmentEvents.description,
        eventTimestamp: shipmentEvents.eventTimestamp,
      })
      .from(shipmentEvents)
      .where(eq(shipmentEvents.shipmentId, shipment.id))
      .orderBy(asc(shipmentEvents.eventTimestamp)),
    getStatusCatalog(),
  ]);

  const events: PublicTrackingEvent[] = eventRows.map((event) => {
    const entry = catalog.get(event.status);
    return {
      status: event.status,
      statusLabelAr: entry?.labelAr ?? event.status,
      group: event.statusGroup,
      isException: entry?.isException ?? false,
      location: event.location,
      description: event.description,
      eventTimestamp: new Date(event.eventTimestamp).toISOString(),
    };
  });

  const result: PublicTrackingResult = {
    trackingNumber: shipment.trackingNumber,
    currentStatus: shipment.currentStatus,
    currentStatusLabel: catalog.get(shipment.currentStatus)?.labelAr ?? shipment.currentStatus,
    statusGroup: shipment.statusGroup,
    estimatedDeliveryDate: shipment.estimatedDeliveryDate
      ? String(shipment.estimatedDeliveryDate)
      : null,
    estimatedDelivery: shipment.estimatedDelivery,
    destinationCity: shipment.destinationCity,
    events,
  };

  return {
    ok: true,
    message: "تم العثور على الشحنة.",
    data: {
      result: JSON.stringify(result),
    },
  };
}
