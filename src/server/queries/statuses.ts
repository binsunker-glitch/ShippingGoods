import "server-only";

import { cache } from "react";

import { STATUS_GROUP_BY_CODE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { StatusGroup } from "@/db/schema";

export type StatusCatalogMap = Map<
  string,
  {
    code: string;
    labelAr: string;
    group: StatusGroup;
    sortOrder: number;
    isException: boolean;
    restricted: boolean;
  }
>;

/**
 * The status catalogue lives in the database and is configurable by admins.
 *
 * The dashboard/tab `group` is NOT stored in the DB — it is derived from the
 * canonical `STATUS_GROUP_BY_CODE` map so the UI taxonomy stays authoritative
 * and in one place. Only labels, ordering, and the active/restricted flags
 * come from the catalogue rows.
 */
export const getStatusCatalog = cache(async (): Promise<StatusCatalogMap> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_status_catalog")
    .select("code, label_ar, sort_order, is_exception, restricted, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const map: StatusCatalogMap = new Map();
  for (const row of data ?? []) {
    map.set(row.code, {
      code: row.code,
      labelAr: row.label_ar,
      group: STATUS_GROUP_BY_CODE[row.code] ?? "warehouse",
      sortOrder: row.sort_order,
      isException: row.is_exception,
      restricted: row.restricted,
    });
  }
  return map;
});

export async function getStatusLabel(code: string): Promise<string> {
  const catalog = await getStatusCatalog();
  return catalog.get(code)?.labelAr ?? code;
}

/** Statuses reachable from `fromStatus` (admin-configurable transitions). */
export async function getAllowedTransitions(fromStatus: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_status_transitions")
    .select("to_status")
    .eq("from_status", fromStatus)
    // A transition an admin disabled must not be performable, or the
    // toggle in /admin/statuses would have no effect on real shipments.
    .eq("is_active", true);

  return (data ?? []).map((row) => row.to_status);
}

export async function canTransition(fromStatus: string, toStatus: string): Promise<boolean> {
  const allowed = await getAllowedTransitions(fromStatus);
  return allowed.includes(toStatus);
}
