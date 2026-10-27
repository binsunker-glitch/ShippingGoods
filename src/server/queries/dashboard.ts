import "server-only";

import { statusCodesForGroups } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { StatusGroup } from "@/db/schema";

/** Package statuses that mean "physically in the Guangzhou warehouse". */
const WAREHOUSE_PACKAGE_STATUSES = ["registered", "received"] as const;
/** Package status that means "ready to be consolidated into a shipment". */
const READY_PACKAGE_STATUS = "assigned";

/**
 * Dashboard statistics. Every number is derived from the authenticated
 * customer's own rows — nothing is fabricated and nothing is shared.
 *
 * Shipment `status_group` is derived in TS from `current_status` via the
 * canonical status-code lists, so filters are explicit code lists.
 */
export async function getCustomerStats(customerId: string): Promise<{
  packagesInWarehouse: number;
  readyForConsolidation: number;
  awaitingPayment: number;
  activeShipments: number;
}> {
  const supabase = await createClient();

  const awaitingPaymentCodes = statusCodesForGroups(["awaiting_payment" as StatusGroup]);
  const activeCodes = statusCodesForGroups([
    "warehouse",
    "ready",
    "awaiting_payment",
    "in_transit",
  ] as StatusGroup[]);

  const [warehouse, ready, payment, active] = await Promise.all([
    supabase
      .from("shipment_packages")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("package_status", [...WAREHOUSE_PACKAGE_STATUSES]),
    supabase
      .from("shipment_packages")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("package_status", READY_PACKAGE_STATUS),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("current_status", awaitingPaymentCodes),
    supabase
      .from("shipments")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .in("current_status", activeCodes),
  ]);

  return {
    packagesInWarehouse: warehouse.count ?? 0,
    readyForConsolidation: ready.count ?? 0,
    awaitingPayment: payment.count ?? 0,
    activeShipments: active.count ?? 0,
  };
}

/**
 * Earliest warehouse arrival event per shipment. Returns an empty map when no
 * real receiving event exists — the UI must then show "—" instead of a date.
 *
 * RLS on `shipment_events` already restricts rows to the caller's shipments.
 */
export async function getWarehouseArrivalDates(
  customerId: string,
  shipmentIds: string[],
): Promise<Map<string, Date>> {
  if (shipmentIds.length === 0) return new Map();
  const supabase = await createClient();

  const { data } = await supabase
    .from("shipment_events")
    .select("shipment_id, event_timestamp, status")
    .in("shipment_id", shipmentIds)
    .in("status", ["received_at_warehouse", "registered"])
    .order("event_timestamp", { ascending: true });

  const map = new Map<string, Date>();
  for (const row of data ?? []) {
    if (!map.has(row.shipment_id)) map.set(row.shipment_id, new Date(row.event_timestamp));
  }
  return map;
}
