import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { getDb } from "@/db/client";
import { shipmentStatusCatalog, shipmentStatusTransitions } from "@/db/schema";
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

/** The status catalogue lives in the database and is configurable by admins. */
export const getStatusCatalog = cache(async (): Promise<StatusCatalogMap> => {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shipmentStatusCatalog)
    .where(eq(shipmentStatusCatalog.isActive, true))
    .orderBy(asc(shipmentStatusCatalog.sortOrder));

  const map: StatusCatalogMap = new Map();
  for (const row of rows) {
    map.set(row.code, {
      code: row.code,
      labelAr: row.labelAr,
      group: row.group as StatusGroup,
      sortOrder: row.sortOrder,
      isException: row.isException,
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
  const db = await getDb();
  const rows = await db
    .select({ to: shipmentStatusTransitions.toStatus })
    .from(shipmentStatusTransitions)
    .where(
      and(
        eq(shipmentStatusTransitions.fromStatus, fromStatus),
        // A transition an admin disabled must not be performable, or the
        // toggle in /admin/statuses would have no effect on real shipments.
        eq(shipmentStatusTransitions.isActive, true),
      ),
    );
  return rows.map((row) => row.to);
}

export async function canTransition(fromStatus: string, toStatus: string): Promise<boolean> {
  const allowed = await getAllowedTransitions(fromStatus);
  return allowed.includes(toStatus);
}
