import "server-only";

import { and, asc, count, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { packages, shipmentEvents, shipments } from "@/db/schema";

/**
 * Dashboard statistics. Every number is derived from the authenticated
 * customer's own rows — nothing is fabricated and nothing is shared.
 */
export async function getCustomerStats(customerId: string): Promise<{
  packagesInWarehouse: number;
  readyForConsolidation: number;
  awaitingPayment: number;
  activeShipments: number;
}> {
  const db = await getDb();

  const [warehouseRows, readyRows, paymentRows, activeRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(packages)
      .where(
        and(
          eq(packages.customerId, customerId),
          inArray(packages.packageStatus, ["registered", "received"]),
        ),
      ),
    db
      .select({ value: count() })
      .from(packages)
      .where(and(eq(packages.customerId, customerId), eq(packages.packageStatus, "ready"))),
    db
      .select({ value: count() })
      .from(shipments)
      .where(
        and(
          eq(shipments.customerId, customerId),
          eq(shipments.statusGroup, "awaiting_payment"),
        ),
      ),
    db
      .select({ value: count() })
      .from(shipments)
      .where(
        and(
          eq(shipments.customerId, customerId),
          inArray(shipments.statusGroup, [
            "warehouse",
            "ready",
            "awaiting_payment",
            "in_transit",
          ]),
        ),
      ),
  ]);

  return {
    packagesInWarehouse: Number(warehouseRows[0]?.value ?? 0),
    readyForConsolidation: Number(readyRows[0]?.value ?? 0),
    awaitingPayment: Number(paymentRows[0]?.value ?? 0),
    activeShipments: Number(activeRows[0]?.value ?? 0),
  };
}

/**
 * Earliest warehouse arrival event per shipment. Returns an empty map when no
 * real receiving event exists — the UI must then show "—" instead of a date.
 */
export async function getWarehouseArrivalDates(
  customerId: string,
  shipmentIds: string[],
): Promise<Map<string, Date>> {
  if (shipmentIds.length === 0) return new Map();
  const db = await getDb();

  const rows = await db
    .select({
      shipmentId: shipmentEvents.shipmentId,
      at: shipmentEvents.eventTimestamp,
    })
    .from(shipmentEvents)
    .innerJoin(shipments, eq(shipmentEvents.shipmentId, shipments.id))
    .where(
      and(
        eq(shipments.customerId, customerId),
        inArray(shipmentEvents.shipmentId, shipmentIds),
        inArray(shipmentEvents.status, ["received_warehouse", "registered"]),
      ),
    )
    .orderBy(asc(shipmentEvents.eventTimestamp));

  const map = new Map<string, Date>();
  for (const row of rows) {
    if (!map.has(row.shipmentId)) map.set(row.shipmentId, new Date(row.at));
  }
  return map;
}
