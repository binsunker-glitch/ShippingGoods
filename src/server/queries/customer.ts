import "server-only";

import { createClient } from "@/lib/supabase/server";

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
  warehouseReceivedAt: string | null;
  createdAt: string;
  /** The shipment this package currently belongs to, if any. */
  shipmentId: string | null;
  shipmentTrackingNumber: string | null;
  consolidationGroupReference: string | null;
};

export type PackageFilters = { status?: string; page?: number; perPage?: number };

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function dimToStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const PACKAGE_COLUMNS =
  "id, package_reference, carrier_tracking_number, description, weight, dimensions, package_status, warehouse_received_at, created_at, shipment_id";

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
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 12));
  const status = filters.status && filters.status !== "all" ? filters.status : null;

  const countQuery = supabase
    .from("shipment_packages")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  if (status) countQuery.eq("package_status", status);

  const rowsQuery = supabase
    .from("shipment_packages")
    .select(PACKAGE_COLUMNS)
    .eq("customer_id", customerId);
  if (status) rowsQuery.eq("package_status", status);
  rowsQuery.order("created_at", { ascending: false });
  const from = (page - 1) * perPage;
  rowsQuery.range(from, from + perPage - 1);

  const allQuery = supabase
    .from("shipment_packages")
    .select("package_status")
    .eq("customer_id", customerId);

  const [countRes, rowsRes, allRes] = await Promise.all([countQuery, rowsQuery, allQuery]);
  const total = countRes.count ?? 0;

  // Resolve shipment tracking numbers for the page's linked packages.
  const rows = rowsRes.data ?? [];
  const shipmentIds = [
    ...new Set(rows.map((r) => r.shipment_id).filter((v): v is string => Boolean(v))),
  ];
  const trackingByShipment = new Map<string, string>();
  if (shipmentIds.length > 0) {
    const { data } = await supabase
      .from("shipments")
      .select("id, tracking_number")
      .in("id", shipmentIds);
    for (const s of data ?? []) trackingByShipment.set(s.id, s.tracking_number);
  }

  const counts: Record<string, number> = { all: 0 };
  for (const row of allRes.data ?? []) {
    counts[row.package_status] = (counts[row.package_status] ?? 0) + 1;
    counts.all += 1;
  }

  const enriched: CustomerPackage[] = rows.map((row) => ({
    id: row.id,
    packageReference: row.package_reference,
    carrierTrackingNumber: row.carrier_tracking_number,
    description: row.description,
    weight: str(row.weight),
    dimensions: dimToStr(row.dimensions),
    packageStatus: row.package_status,
    warehouseReceivedAt: row.warehouse_received_at,
    createdAt: row.created_at,
    shipmentId: row.shipment_id,
    shipmentTrackingNumber: row.shipment_id
      ? trackingByShipment.get(row.shipment_id) ?? null
      : null,
    consolidationGroupReference: null, // resolved below only when linked
  }));

  // Package -> open consolidation group reference.
  const ids = enriched.map((r) => r.id);
  if (ids.length > 0) {
    const { data: items } = await supabase
      .from("consolidation_items")
      .select("package_id, consolidation_groups!inner(group_code, status)")
      .in("package_id", ids)
      .eq("consolidation_groups.status", "open");
    const refByPackage = new Map<string, string>();
    for (const item of items ?? []) {
      const grp = item.consolidation_groups as unknown as
        | { group_code: string; status: string }
        | { group_code: string; status: string }[]
        | null;
      const g = Array.isArray(grp) ? grp[0] : grp;
      if (g) refByPackage.set(item.package_id, g.group_code);
    }
    for (const row of enriched) {
      row.consolidationGroupReference = refByPackage.get(row.id) ?? null;
    }
  }

  return {
    rows: enriched,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    counts,
  };
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
  createdAt: string;
  packageCount: number;
  totalWeight: string | null;
};

export async function listConsolidationGroups(
  customerId: string,
): Promise<ConsolidationGroupView[]> {
  const supabase = await createClient();

  const { data: groups } = await supabase
    .from("consolidation_groups")
    .select("id, group_code, status, shipment_id, notes, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (!groups || groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);
  const { data: items } = await supabase
    .from("consolidation_items")
    .select("group_id, package_id, shipment_packages!inner(weight)")
    .in("group_id", groupIds);

  const shipmentIds = groups
    .map((g) => g.shipment_id)
    .filter((id): id is string => Boolean(id));
  const trackingByShipment = new Map<string, string>();
  if (shipmentIds.length > 0) {
    const { data } = await supabase
      .from("shipments")
      .select("id, tracking_number")
      .in("id", shipmentIds)
      .eq("customer_id", customerId);
    for (const s of data ?? []) trackingByShipment.set(s.id, s.tracking_number);
  }

  const perGroup = new Map<string, { count: number; weight: number }>();
  for (const item of items ?? []) {
    const pkg = item.shipment_packages as unknown as { weight: unknown } | null;
    const entry = perGroup.get(item.group_id) ?? { count: 0, weight: 0 };
    entry.count += 1;
    entry.weight += pkg?.weight ? Number(pkg.weight) : 0;
    perGroup.set(item.group_id, entry);
  }

  return groups.map((group) => {
    const stats = perGroup.get(group.id) ?? { count: 0, weight: 0 };
    return {
      id: group.id,
      groupReference: group.group_code,
      status: group.status,
      shipmentId: group.shipment_id,
      shipmentTrackingNumber: group.shipment_id
        ? trackingByShipment.get(group.shipment_id) ?? null
        : null,
      notes: group.notes,
      createdAt: group.created_at,
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
  readAt: string | null;
  createdAt: string;
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
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.max(1, Math.min(50, options.perPage ?? 20));
  const from = (page - 1) * perPage;

  const base = supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  if (options.unreadOnly) base.is("read_at", null);

  const rowsQuery = supabase
    .from("notifications")
    .select("id, title, message, notification_type, link, read_at, created_at")
    .eq("customer_id", customerId);
  if (options.unreadOnly) rowsQuery.is("read_at", null);
  rowsQuery.order("created_at", { ascending: false }).range(from, from + perPage - 1);

  const unreadQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .is("read_at", null);

  const [countRes, rowsRes, unreadRes] = await Promise.all([base, rowsQuery, unreadQuery]);
  const total = countRes.count ?? 0;

  return {
    rows: (rowsRes.data ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      notificationType: n.notification_type ?? "info",
      link: n.link,
      readAt: n.read_at,
      createdAt: n.created_at,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    unreadCount: unreadRes.count ?? 0,
  };
}

/** Lightweight count for the sidebar / topbar bell. */
export async function getUnreadNotificationCount(customerId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .is("read_at", null);
  return count ?? 0;
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
  repliedAt: string | null;
  createdAt: string;
};

export async function listSupportTickets(customerId: string): Promise<TicketView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, subject, description, status, priority, reply, replied_at, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((t) => ({
    id: t.id,
    ticketNumber: t.ticket_number,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    reply: t.reply,
    repliedAt: t.replied_at,
    createdAt: t.created_at,
  }));
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
  createdAt: string;
  reviewedAt: string | null;
};

export async function listCustomerClaims(customerId: string): Promise<ClaimView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_claim_requests")
    .select(
      "id, shipment_tracking_number, carrier_tracking_number, description, request_status, review_note, created_at, reviewed_at",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((c) => ({
    id: c.id,
    shipmentTrackingNumber: c.shipment_tracking_number,
    carrierTrackingNumber: c.carrier_tracking_number,
    description: c.description,
    requestStatus: c.request_status,
    reviewNote: c.review_note,
    createdAt: c.created_at,
    reviewedAt: c.reviewed_at,
  }));
}

/** True when the customer already has an open claim for this tracking number. */
export async function hasOpenClaim(
  customerId: string,
  trackingNumber: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_claim_requests")
    .select("id")
    .eq("customer_id", customerId)
    .eq("shipment_tracking_number", trackingNumber)
    .in("request_status", ["pending"])
    .limit(1);

  return (data ?? []).length > 0;
}
