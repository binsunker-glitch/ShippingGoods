import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  consolidationGroups,
  consolidationItems,
  notifications,
  packages,
  shipmentClaimRequests,
  shipmentPackages,
  shipments,
  supportTickets,
} from "@/db/schema";

/* ------------------------------------------------------------------ */
/* Packages (customer view of warehouse inventory)                     */
/* ------------------------------------------------------------------ */

export type CustomerPackage = {
  id: string;
  packageReference: string;
  carrierTrackingNumber: string | null;
  description: string | null;
  weight: string | null;
  dimensions: string | null;
  packageStatus: string;
  warehouseReceivedAt: Date | null;
  createdAt: Date;
  /** The shipment this package currently belongs to, if any. */
  shipmentId: string | null;
  shipmentTrackingNumber: string | null;
  consolidationGroupReference: string | null;
};

export type PackageFilters = { status?: string; page?: number; perPage?: number };

/** Paged, strictly customer-scoped package list. */
export async function listCustomerPackages(
  customerId: string,
  filters: PackageFilters = {},
): Promise<{
  rows: CustomerPackage[];
  total: number;
  page: number;
  totalPages: number;
  counts: Record<string, number>;
}> {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 12));

  const status = filters.status && filters.status !== "all" ? filters.status : undefined;
  const where = status
    ? and(eq(packages.customerId, customerId), eq(packages.packageStatus, status as never))
    : eq(packages.customerId, customerId);

  const totalRows = await db.select({ value: count() }).from(packages).where(where);
  const total = Number(totalRows[0]?.value ?? 0);

  const rows = await db
    .select({
      id: packages.id,
      packageReference: packages.packageReference,
      carrierTrackingNumber: packages.carrierTrackingNumber,
      description: packages.description,
      weight: packages.weight,
      dimensions: packages.dimensions,
      packageStatus: packages.packageStatus,
      warehouseReceivedAt: packages.warehouseReceivedAt,
      createdAt: packages.createdAt,
    })
    .from(packages)
    .where(where)
    .orderBy(desc(packages.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Package -> shipment and package -> consolidation links, resolved in two
  // extra round trips so the main list query stays a simple indexed select.
  const ids = rows.map((row) => row.id);
  const [links, groupRefs] = await Promise.all([
    getPackageShipmentLinks(customerId, ids),
    getPackageConsolidationRefs(ids),
  ]);

  const enriched: CustomerPackage[] = rows.map((row) => ({
    ...row,
    shipmentId: links.get(row.id)?.shipmentId ?? null,
    shipmentTrackingNumber: links.get(row.id)?.trackingNumber ?? null,
    consolidationGroupReference: groupRefs.get(row.id) ?? null,
  }));

  const groupCounts = await db
    .select({ status: packages.packageStatus, value: count() })
    .from(packages)
    .where(eq(packages.customerId, customerId))
    .groupBy(packages.packageStatus);

  const counts: Record<string, number> = { all: 0 };
  for (const row of groupCounts) {
    counts[row.status] = Number(row.value);
    counts.all += Number(row.value);
  }

  return {
    rows: enriched,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    counts,
  };
}

async function getPackageShipmentLinks(
  customerId: string,
  packageIds: string[],
): Promise<Map<string, { shipmentId: string; trackingNumber: string }>> {
  const map = new Map<string, { shipmentId: string; trackingNumber: string }>();
  if (packageIds.length === 0) return map;

  const db = await getDb();
  const rows = await db
    .select({
      packageId: shipmentPackages.packageId,
      shipmentId: shipments.id,
      trackingNumber: shipments.trackingNumber,
    })
    .from(shipmentPackages)
    .innerJoin(shipments, eq(shipmentPackages.shipmentId, shipments.id))
    .where(
      and(
        inArray(shipmentPackages.packageId, packageIds),
        eq(shipments.customerId, customerId),
      ),
    );

  for (const row of rows) {
    map.set(row.packageId, { shipmentId: row.shipmentId, trackingNumber: row.trackingNumber });
  }
  return map;
}

async function getPackageConsolidationRefs(
  packageIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (packageIds.length === 0) return map;

  const db = await getDb();
  const rows = await db
    .select({
      packageId: consolidationItems.packageId,
      reference: consolidationGroups.groupReference,
    })
    .from(consolidationItems)
    .innerJoin(consolidationGroups, eq(consolidationItems.consolidationGroupId, consolidationGroups.id))
    .where(
      and(
        inArray(consolidationItems.packageId, packageIds),
        eq(consolidationGroups.status, "open"),
      ),
    );

  for (const row of rows) map.set(row.packageId, row.reference);
  return map;
}

/* ------------------------------------------------------------------ */
/* Consolidation                                                       */
/* ------------------------------------------------------------------ */

export type ConsolidationGroupView = {
  id: string;
  groupReference: string;
  status: string;
  shipmentId: string | null;
  shipmentTrackingNumber: string | null;
  notes: string | null;
  createdAt: Date;
  packageCount: number;
  totalWeight: string | null;
};

export async function listConsolidationGroups(
  customerId: string,
): Promise<ConsolidationGroupView[]> {
  const db = await getDb();
  const groups = await db
    .select({
      id: consolidationGroups.id,
      groupReference: consolidationGroups.groupReference,
      status: consolidationGroups.status,
      shipmentId: consolidationGroups.shipmentId,
      notes: consolidationGroups.notes,
      createdAt: consolidationGroups.createdAt,
    })
    .from(consolidationGroups)
    .where(eq(consolidationGroups.customerId, customerId))
    .orderBy(desc(consolidationGroups.createdAt));

  if (groups.length === 0) return [];

  const groupIds = groups.map((group) => group.id);
  const items = await db
    .select({
      groupId: consolidationItems.consolidationGroupId,
      packageId: consolidationItems.packageId,
      weight: packages.weight,
    })
    .from(consolidationItems)
    .innerJoin(packages, eq(consolidationItems.packageId, packages.id))
    .where(inArray(consolidationItems.consolidationGroupId, groupIds));

  const shipmentRefs = new Map<string, string>();
  const linkedIds = groups
    .map((group) => group.shipmentId)
    .filter((id): id is string => Boolean(id));
  if (linkedIds.length > 0) {
    const shipmentRows = await db
      .select({ id: shipments.id, trackingNumber: shipments.trackingNumber })
      .from(shipments)
      .where(and(inArray(shipments.id, linkedIds), eq(shipments.customerId, customerId)));
    for (const row of shipmentRows) shipmentRefs.set(row.id, row.trackingNumber);
  }

  const perGroup = new Map<string, { count: number; weight: number }>();
  for (const item of items) {
    const entry = perGroup.get(item.groupId) ?? { count: 0, weight: 0 };
    entry.count += 1;
    entry.weight += item.weight ? Number(item.weight) : 0;
    perGroup.set(item.groupId, entry);
  }

  return groups.map((group) => {
    const stats = perGroup.get(group.id) ?? { count: 0, weight: 0 };
    return {
      id: group.id,
      groupReference: group.groupReference,
      status: group.status,
      shipmentId: group.shipmentId,
      shipmentTrackingNumber: group.shipmentId
        ? (shipmentRefs.get(group.shipmentId) ?? null)
        : null,
      notes: group.notes,
      createdAt: group.createdAt,
      packageCount: stats.count,
      totalWeight: stats.count > 0 ? stats.weight.toFixed(3) : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export type NotificationView = {
  id: string;
  title: string;
  message: string;
  notificationType: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotifications(
  customerId: string,
  options: { page?: number; perPage?: number; unreadOnly?: boolean } = {},
): Promise<{
  rows: NotificationView[];
  total: number;
  page: number;
  totalPages: number;
  unreadCount: number;
}> {
  const db = await getDb();
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.max(1, Math.min(50, options.perPage ?? 20));

  const where = options.unreadOnly
    ? and(eq(notifications.customerId, customerId), sql`${notifications.readAt} IS NULL`)
    : eq(notifications.customerId, customerId);

  const totalRows = await db.select({ value: count() }).from(notifications).where(where);
  const total = Number(totalRows[0]?.value ?? 0);

  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      message: notifications.message,
      notificationType: notifications.notificationType,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const unreadRows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.customerId, customerId), sql`${notifications.readAt} IS NULL`));

  return {
    rows,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    unreadCount: Number(unreadRows[0]?.value ?? 0),
  };
}

/** Lightweight count for the sidebar / topbar bell. */
export async function getUnreadNotificationCount(customerId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.customerId, customerId), sql`${notifications.readAt} IS NULL`));
  return Number(rows[0]?.value ?? 0);
}

/* ------------------------------------------------------------------ */
/* Support tickets                                                     */
/* ------------------------------------------------------------------ */

export type TicketView = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
};

export async function listSupportTickets(customerId: string): Promise<TicketView[]> {
  const db = await getDb();
  return db
    .select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      description: supportTickets.description,
      status: supportTickets.status,
      priority: supportTickets.priority,
      reply: supportTickets.reply,
      repliedAt: supportTickets.repliedAt,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.customerId, customerId))
    .orderBy(desc(supportTickets.createdAt));
}

/* ------------------------------------------------------------------ */
/* Claim requests (ربط طرد)                                            */
/* ------------------------------------------------------------------ */

export type ClaimView = {
  id: string;
  shipmentTrackingNumber: string | null;
  carrierTrackingNumber: string | null;
  description: string | null;
  requestStatus: string;
  reviewNote: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

export async function listCustomerClaims(customerId: string): Promise<ClaimView[]> {
  const db = await getDb();
  return db
    .select({
      id: shipmentClaimRequests.id,
      shipmentTrackingNumber: shipmentClaimRequests.shipmentTrackingNumber,
      carrierTrackingNumber: shipmentClaimRequests.carrierTrackingNumber,
      description: shipmentClaimRequests.description,
      requestStatus: shipmentClaimRequests.requestStatus,
      reviewNote: shipmentClaimRequests.reviewNote,
      createdAt: shipmentClaimRequests.createdAt,
      reviewedAt: shipmentClaimRequests.reviewedAt,
    })
    .from(shipmentClaimRequests)
    .where(eq(shipmentClaimRequests.customerId, customerId))
    .orderBy(desc(shipmentClaimRequests.createdAt));
}

/** True when the customer already has an open claim for this tracking number. */
export async function hasOpenClaim(
  customerId: string,
  trackingNumber: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: shipmentClaimRequests.id })
    .from(shipmentClaimRequests)
    .where(
      and(
        eq(shipmentClaimRequests.customerId, customerId),
        eq(shipmentClaimRequests.shipmentTrackingNumber, trackingNumber),
        inArray(shipmentClaimRequests.requestStatus, ["pending", "auto_verified"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
