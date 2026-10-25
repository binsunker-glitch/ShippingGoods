import "server-only";

import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  packages,
  profiles,
  shipmentEvents,
  shipmentPackages,
  shipmentPayments,
  shipments,
} from "@/db/schema";
import type { StatusGroup } from "@/db/schema";

export const DEFAULT_PER_PAGE = 10;

export type ShipmentFilters = {
  q?: string;
  status?: string;
  sort?: "newest" | "oldest" | "updated";
  page?: number;
  perPage?: number;
};

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export type ShipmentListItem = {
  id: string;
  trackingNumber: string;
  description: string;
  currentStatus: string;
  statusGroup: StatusGroup;
  weight: string | null;
  origin: string;
  destinationCity: string | null;
  packageCount: number;
  paymentStatus: string;
  shippingFee: string | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

function groupCondition(status: string | undefined): SQL | undefined {
  if (!status || status === "all") return undefined;
  return eq(shipments.statusGroup, status as StatusGroup);
}

/** Paged, searchable, strictly customer-scoped shipment list. */
export async function listCustomerShipments(
  customerId: string,
  filters: ShipmentFilters = {},
): Promise<{
  rows: ShipmentListItem[];
  total: number;
  page: number;
  totalPages: number;
  counts: Record<string, number>;
}> {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? DEFAULT_PER_PAGE));

  const conditions: (SQL | undefined)[] = [eq(shipments.customerId, customerId)];
  conditions.push(groupCondition(filters.status));
  const needle = filters.q?.trim();
  if (needle) {
    const pattern = `%${needle}%`;
    conditions.push(
      or(ilike(shipments.trackingNumber, pattern), ilike(shipments.description, pattern)),
    );
  }
  const where = and(...conditions);

  const totalRows = await db.select({ value: count() }).from(shipments).where(where);
  const total = Number(totalRows[0]?.value ?? 0);

  const order =
    filters.sort === "oldest"
      ? asc(shipments.createdAt)
      : filters.sort === "updated"
        ? desc(shipments.updatedAt)
        : desc(shipments.createdAt);

  const rows = await db
    .select({
      id: shipments.id,
      trackingNumber: shipments.trackingNumber,
      description: shipments.description,
      currentStatus: shipments.currentStatus,
      statusGroup: shipments.statusGroup,
      weight: shipments.weight,
      origin: shipments.origin,
      destinationCity: shipments.destinationCity,
      packageCount: shipments.packageCount,
      paymentStatus: shipments.paymentStatus,
      shippingFee: shipments.shippingFee,
      currency: shipments.currency,
      createdAt: shipments.createdAt,
      updatedAt: shipments.updatedAt,
    })
    .from(shipments)
    .where(where)
    .orderBy(order)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const groupCounts = await db
    .select({ group: shipments.statusGroup, value: count() })
    .from(shipments)
    .where(eq(shipments.customerId, customerId))
    .groupBy(shipments.statusGroup);

  const counts: Record<string, number> = { all: 0 };
  for (const row of groupCounts) {
    counts[row.group] = Number(row.value);
    counts.all += Number(row.value);
  }

  return {
    rows,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    counts,
  };
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export type ShipmentCore = typeof shipments.$inferSelect;

export type ShipmentDetail = ShipmentCore & {
  customerNumber: string | null;
  customerName: string | null;
  events: {
    id: string;
    status: string;
    statusGroup: StatusGroup;
    location: string | null;
    description: string;
    eventTimestamp: Date;
    source: string;
    actorName: string | null;
  }[];
  packages: {
    id: string;
    packageReference: string;
    carrierTrackingNumber: string | null;
    description: string | null;
    weight: string | null;
    dimensions: string | null;
    packageStatus: string;
    warehouseReceivedAt: Date | null;
  }[];
  payments: {
    id: string;
    amount: string;
    currency: string;
    paymentMethod: string;
    paymentStatus: string;
    transactionReference: string | null;
    recordedAt: Date;
  }[];
};

async function hydrate(core: ShipmentCore): Promise<ShipmentDetail> {
  const db = await getDb();

  const [eventRows, packageRows, paymentRows, customerRows] = await Promise.all([
    db
      .select({
        id: shipmentEvents.id,
        status: shipmentEvents.status,
        statusGroup: shipmentEvents.statusGroup,
        location: shipmentEvents.location,
        description: shipmentEvents.description,
        eventTimestamp: shipmentEvents.eventTimestamp,
        source: shipmentEvents.source,
        actorName: profiles.fullName,
      })
      .from(shipmentEvents)
      .leftJoin(profiles, eq(shipmentEvents.createdBy, profiles.id))
      .where(eq(shipmentEvents.shipmentId, core.id))
      .orderBy(asc(shipmentEvents.eventTimestamp)),

    db
      .select({
        id: packages.id,
        packageReference: packages.packageReference,
        carrierTrackingNumber: packages.carrierTrackingNumber,
        description: packages.description,
        weight: packages.weight,
        dimensions: packages.dimensions,
        packageStatus: packages.packageStatus,
        warehouseReceivedAt: packages.warehouseReceivedAt,
      })
      .from(shipmentPackages)
      .innerJoin(packages, eq(shipmentPackages.packageId, packages.id))
      .where(eq(shipmentPackages.shipmentId, core.id))
      .orderBy(asc(packages.createdAt)),

    db
      .select({
        id: shipmentPayments.id,
        amount: shipmentPayments.amount,
        currency: shipmentPayments.currency,
        paymentMethod: shipmentPayments.paymentMethod,
        paymentStatus: shipmentPayments.paymentStatus,
        transactionReference: shipmentPayments.transactionReference,
        recordedAt: shipmentPayments.recordedAt,
      })
      .from(shipmentPayments)
      .where(eq(shipmentPayments.shipmentId, core.id))
      .orderBy(desc(shipmentPayments.recordedAt)),

    core.customerId
      ? db
          .select({ number: profiles.customerNumber, name: profiles.fullName })
          .from(profiles)
          .where(eq(profiles.id, core.customerId))
          .limit(1)
      : Promise.resolve([] as { number: string; name: string }[]),
  ]);

  return {
    ...core,
    customerNumber: customerRows[0]?.number ?? null,
    customerName: customerRows[0]?.name ?? null,
    events: eventRows,
    packages: packageRows,
    payments: paymentRows,
  } satisfies ShipmentDetail;
}

/** Customer view: ownership is part of the WHERE clause (IDOR protection). */
export async function getCustomerShipmentDetail(
  customerId: string,
  idOrTracking: string,
): Promise<ShipmentDetail | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shipments)
    .where(
      and(
        eq(shipments.customerId, customerId),
        or(eq(shipments.id, idOrTracking), eq(shipments.trackingNumber, idOrTracking)),
      ),
    )
    .limit(1);

  const shipment = rows[0];
  if (!shipment) return null;
  return hydrate(shipment);
}

/** Staff view: no ownership filter (guarded by a permission check upstream). */
export async function getAdminShipmentDetail(idOrTracking: string): Promise<ShipmentDetail | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(shipments)
    .where(or(eq(shipments.id, idOrTracking), eq(shipments.trackingNumber, idOrTracking)))
    .limit(1);

  const shipment = rows[0];
  if (!shipment) return null;
  return hydrate(shipment);
}
