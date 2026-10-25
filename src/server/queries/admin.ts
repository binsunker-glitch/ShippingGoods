import "server-only";

import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  auditLogs,
  packages,
  profiles,
  shipmentClaimRequests,
  shipmentEvents,
  shipmentPayments,
  shipmentStatusCatalog,
  shipmentStatusTransitions,
  shipments,
  supportTickets,
} from "@/db/schema";

/* ------------------------------------------------------------------ */
/* Dashboard statistics (real counts, nothing fabricated)              */
/* ------------------------------------------------------------------ */

export type AdminStats = {
  totalCustomers: number;
  newCustomers30d: number;
  totalShipments: number;
  activeShipments: number;
  deliveredShipments: number;
  packagesInWarehouse: number;
  pendingClaims: number;
  openTickets: number;
  awaitingPayment: number;
  collectedPayments: string;
};

export async function getAdminStats(): Promise<AdminStats> {
  const db = await getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalCustomers,
    newCustomers,
    totalShipments,
    activeShipments,
    deliveredShipments,
    packagesInWarehouse,
    pendingClaims,
    openTickets,
    awaitingPayment,
    collected,
  ] = await Promise.all([
    db.select({ value: count() }).from(profiles).where(eq(profiles.role, "customer")),
    db
      .select({ value: count() })
      .from(profiles)
      .where(and(eq(profiles.role, "customer"), sql`${profiles.createdAt} >= ${thirtyDaysAgo}`)),
    db.select({ value: count() }).from(shipments),
    db
      .select({ value: count() })
      .from(shipments)
      .where(
        sql`${shipments.statusGroup} IN ('warehouse','ready','awaiting_payment','in_transit','exception')`,
      ),
    db.select({ value: count() }).from(shipments).where(eq(shipments.statusGroup, "delivered")),
    db
      .select({ value: count() })
      .from(packages)
      .where(sql`${packages.packageStatus} IN ('registered','received','ready')`),
    db
      .select({ value: count() })
      .from(shipmentClaimRequests)
      .where(sql`${shipmentClaimRequests.requestStatus} IN ('pending','auto_verified')`),
    db
      .select({ value: count() })
      .from(supportTickets)
      .where(sql`${supportTickets.status} IN ('open','in_progress')`),
    db.select({ value: count() }).from(shipments).where(eq(shipments.statusGroup, "awaiting_payment")),
    db
      .select({ total: sql<string>`coalesce(sum(${shipmentPayments.amount}), 0)` })
      .from(shipmentPayments)
      .where(eq(shipmentPayments.paymentStatus, "completed")),
  ]);

  return {
    totalCustomers: Number(totalCustomers[0]?.value ?? 0),
    newCustomers30d: Number(newCustomers[0]?.value ?? 0),
    totalShipments: Number(totalShipments[0]?.value ?? 0),
    activeShipments: Number(activeShipments[0]?.value ?? 0),
    deliveredShipments: Number(deliveredShipments[0]?.value ?? 0),
    packagesInWarehouse: Number(packagesInWarehouse[0]?.value ?? 0),
    pendingClaims: Number(pendingClaims[0]?.value ?? 0),
    openTickets: Number(openTickets[0]?.value ?? 0),
    awaitingPayment: Number(awaitingPayment[0]?.value ?? 0),
    collectedPayments: String(collected[0]?.total ?? "0"),
  };
}

/** Recent activity for the admin dashboard, all real rows. */
export async function getRecentActivity(limit = 8) {
  const db = await getDb();
  return db
    .select({
      id: auditLogs.id,
      actorLabel: auditLogs.actorLabel,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export type CustomerFilters = { q?: string; status?: string; page?: number; perPage?: number };

export async function listCustomers(filters: CustomerFilters = {}) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const conditions: (SQL | undefined)[] = [eq(profiles.role, "customer")];
  if (filters.status === "active" || filters.status === "suspended") {
    conditions.push(eq(profiles.accountStatus, filters.status));
  }
  const needle = filters.q?.trim();
  if (needle) {
    const pattern = `%${needle}%`;
    conditions.push(
      or(
        ilike(profiles.fullName, pattern),
        ilike(profiles.customerNumber, pattern),
        ilike(profiles.phone, pattern),
        ilike(profiles.email, pattern),
      ),
    );
  }
  const where = and(...conditions);

  const totalRows = await db.select({ value: count() }).from(profiles).where(where);
  const total = Number(totalRows[0]?.value ?? 0);

  const rows = await db
    .select({
      id: profiles.id,
      customerNumber: profiles.customerNumber,
      fullName: profiles.fullName,
      phone: profiles.phone,
      email: profiles.email,
      city: profiles.city,
      accountStatus: profiles.accountStatus,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(where)
    .orderBy(desc(profiles.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    rows,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getCustomerById(profileId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return rows[0] ?? null;
}

/** Aggregate counters shown on the customer detail page. */
export async function getCustomerCounters(profileId: string) {
  const db = await getDb();
  const [shipmentRows, packageRows, ticketRows] = await Promise.all([
    db.select({ value: count() }).from(shipments).where(eq(shipments.customerId, profileId)),
    db.select({ value: count() }).from(packages).where(eq(packages.customerId, profileId)),
    db.select({ value: count() }).from(supportTickets).where(eq(supportTickets.customerId, profileId)),
  ]);
  return {
    shipments: Number(shipmentRows[0]?.value ?? 0),
    packages: Number(packageRows[0]?.value ?? 0),
    tickets: Number(ticketRows[0]?.value ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Admin shipment list                                                 */
/* ------------------------------------------------------------------ */

export async function listAllShipments(filters: {
  q?: string;
  status?: string;
  group?: string;
  page?: number;
  perPage?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const conditions: (SQL | undefined)[] = [];
  if (filters.group && filters.group !== "all") {
    conditions.push(eq(shipments.statusGroup, filters.group as never));
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(shipments.currentStatus, filters.status));
  }
  const needle = filters.q?.trim();
  if (needle) {
    const pattern = `%${needle}%`;
    conditions.push(
      or(
        ilike(shipments.trackingNumber, pattern),
        ilike(shipments.description, pattern),
        ilike(profiles.customerNumber, pattern),
        ilike(profiles.fullName, pattern),
      ),
    );
  }

  const base = db
    .select({ id: shipments.id })
    .from(shipments)
    .leftJoin(profiles, eq(shipments.customerId, profiles.id));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const countRows = await base.where(where);
  const total = countRows.length;

  const rows = await db
    .select({
      id: shipments.id,
      trackingNumber: shipments.trackingNumber,
      description: shipments.description,
      currentStatus: shipments.currentStatus,
      statusGroup: shipments.statusGroup,
      weight: shipments.weight,
      packageCount: shipments.packageCount,
      paymentStatus: shipments.paymentStatus,
      shippingFee: shipments.shippingFee,
      currency: shipments.currency,
      destinationCity: shipments.destinationCity,
      customerId: shipments.customerId,
      customerNumber: profiles.customerNumber,
      customerName: profiles.fullName,
      updatedAt: shipments.updatedAt,
    })
    .from(shipments)
    .leftJoin(profiles, eq(shipments.customerId, profiles.id))
    .where(where)
    .orderBy(desc(shipments.updatedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/* ------------------------------------------------------------------ */
/* Warehouse                                                           */
/* ------------------------------------------------------------------ */

export async function listWarehousePackages(filters: {
  q?: string;
  status?: string;
  page?: number;
  perPage?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const conditions: (SQL | undefined)[] = [];
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(packages.packageStatus, filters.status as never));
  }
  const needle = filters.q?.trim();
  if (needle) {
    const pattern = `%${needle}%`;
    conditions.push(
      or(
        ilike(packages.packageReference, pattern),
        ilike(packages.carrierTrackingNumber, pattern),
        ilike(profiles.customerNumber, pattern),
        ilike(profiles.fullName, pattern),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const countRows = await db
    .select({ id: packages.id })
    .from(packages)
    .leftJoin(profiles, eq(packages.customerId, profiles.id))
    .where(where);
  const total = countRows.length;

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
      notes: packages.notes,
      customerId: packages.customerId,
      customerNumber: profiles.customerNumber,
      customerName: profiles.fullName,
      createdAt: packages.createdAt,
    })
    .from(packages)
    .leftJoin(profiles, eq(packages.customerId, profiles.id))
    .where(where)
    .orderBy(desc(packages.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/* ------------------------------------------------------------------ */
/* Claims, tickets, payments, audit                                    */
/* ------------------------------------------------------------------ */

export async function listAllClaims(filters: { status?: string; page?: number; perPage?: number }) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const where =
    filters.status && filters.status !== "all"
      ? eq(shipmentClaimRequests.requestStatus, filters.status as never)
      : undefined;

  const countRows = await db.select({ id: shipmentClaimRequests.id }).from(shipmentClaimRequests).where(where);
  const total = countRows.length;

  const rows = await db
    .select({
      id: shipmentClaimRequests.id,
      shipmentTrackingNumber: shipmentClaimRequests.shipmentTrackingNumber,
      carrierTrackingNumber: shipmentClaimRequests.carrierTrackingNumber,
      description: shipmentClaimRequests.description,
      requestStatus: shipmentClaimRequests.requestStatus,
      reviewNote: shipmentClaimRequests.reviewNote,
      shipmentId: shipmentClaimRequests.shipmentId,
      customerId: shipmentClaimRequests.customerId,
      customerNumber: profiles.customerNumber,
      customerName: profiles.fullName,
      customerPhone: profiles.phone,
      createdAt: shipmentClaimRequests.createdAt,
      reviewedAt: shipmentClaimRequests.reviewedAt,
    })
    .from(shipmentClaimRequests)
    .leftJoin(profiles, eq(shipmentClaimRequests.customerId, profiles.id))
    .where(where)
    .orderBy(desc(shipmentClaimRequests.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listAllTickets(filters: { status?: string; page?: number; perPage?: number }) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const where =
    filters.status && filters.status !== "all"
      ? eq(supportTickets.status, filters.status as never)
      : undefined;

  const countRows = await db.select({ id: supportTickets.id }).from(supportTickets).where(where);
  const total = countRows.length;

  const rows = await db
    .select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      subject: supportTickets.subject,
      description: supportTickets.description,
      status: supportTickets.status,
      priority: supportTickets.priority,
      reply: supportTickets.reply,
      repliedAt: supportTickets.repliedAt,
      customerId: supportTickets.customerId,
      customerNumber: profiles.customerNumber,
      customerName: profiles.fullName,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .leftJoin(profiles, eq(supportTickets.customerId, profiles.id))
    .where(where)
    .orderBy(desc(supportTickets.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listAllPayments(filters: { status?: string; page?: number; perPage?: number }) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const where =
    filters.status && filters.status !== "all"
      ? eq(shipmentPayments.paymentStatus, filters.status as never)
      : undefined;

  const countRows = await db.select({ id: shipmentPayments.id }).from(shipmentPayments).where(where);
  const total = countRows.length;

  const rows = await db
    .select({
      id: shipmentPayments.id,
      amount: shipmentPayments.amount,
      currency: shipmentPayments.currency,
      paymentMethod: shipmentPayments.paymentMethod,
      paymentStatus: shipmentPayments.paymentStatus,
      transactionReference: shipmentPayments.transactionReference,
      notes: shipmentPayments.notes,
      recordedAt: shipmentPayments.recordedAt,
      shipmentId: shipmentPayments.shipmentId,
      trackingNumber: shipments.trackingNumber,
      customerId: shipments.customerId,
      customerNumber: profiles.customerNumber,
      customerName: profiles.fullName,
    })
    .from(shipmentPayments)
    .innerJoin(shipments, eq(shipmentPayments.shipmentId, shipments.id))
    .leftJoin(profiles, eq(shipments.customerId, profiles.id))
    .where(where)
    .orderBy(desc(shipmentPayments.recordedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listAuditLogs(filters: { q?: string; page?: number; perPage?: number }) {
  const db = await getDb();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 20));

  const needle = filters.q?.trim();
  const where = needle
    ? or(
        ilike(auditLogs.action, `%${needle}%`),
        ilike(auditLogs.actorLabel, `%${needle}%`),
        ilike(auditLogs.entityType, `%${needle}%`),
        ilike(auditLogs.entityId, `%${needle}%`),
      )
    : undefined;

  const countRows = await db.select({ id: auditLogs.id }).from(auditLogs).where(where);
  const total = countRows.length;

  const rows = await db
    .select({
      id: auditLogs.id,
      actorLabel: auditLogs.actorLabel,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/* ------------------------------------------------------------------ */
/* Status catalogue                                                    */
/* ------------------------------------------------------------------ */

export async function listStatusCatalog() {
  const db = await getDb();
  return db.select().from(shipmentStatusCatalog).orderBy(shipmentStatusCatalog.sortOrder);
}

export async function listStatusTransitions() {
  const db = await getDb();
  return db.select().from(shipmentStatusTransitions);
}

/* ------------------------------------------------------------------ */
/* Recent shipment events (for the dashboard feed)                     */
/* ------------------------------------------------------------------ */

export async function getRecentShipmentEvents(limit = 8) {
  const db = await getDb();
  return db
    .select({
      id: shipmentEvents.id,
      status: shipmentEvents.status,
      statusGroup: shipmentEvents.statusGroup,
      location: shipmentEvents.location,
      description: shipmentEvents.description,
      eventTimestamp: shipmentEvents.eventTimestamp,
      trackingNumber: shipments.trackingNumber,
      shipmentId: shipments.id,
    })
    .from(shipmentEvents)
    .innerJoin(shipments, eq(shipmentEvents.shipmentId, shipments.id))
    .orderBy(desc(shipmentEvents.eventTimestamp))
    .limit(limit);
}
