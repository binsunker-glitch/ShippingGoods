import "server-only";

import { STATUS_GROUP_BY_CODE, statusCodesForGroups } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { StatusGroup } from "@/db/schema";

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

function groupOf(code: string): StatusGroup {
  return STATUS_GROUP_BY_CODE[code] ?? "warehouse";
}

/** Sanitizes a search needle for PostgREST `.or()` ilike patterns. */
function like(needle: string): string {
  return `%${needle.replace(/[%_,()]/g, " ")}%`;
}

const ACTIVE_GROUPS = ["warehouse", "ready", "awaiting_payment", "in_transit", "exception"];

/** User ids that hold a staff role (to exclude them from "customer" listings). */
async function getStaffIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_roles").select("user_id");
  return [...new Set((data ?? []).map((r) => r.user_id))];
}

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
  const supabase = await createClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const staffIds = await getStaffIds();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = (build: (q: any) => any) =>
    build(supabase).then((r: { count: number | null }) => r.count ?? 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notStaff = (q: any) =>
    staffIds.length > 0 ? q.not("id", "in", `(${staffIds.map((i) => `"${i}"`).join(",")})`) : q;

  const activeCodes = statusCodesForGroups(ACTIVE_GROUPS as StatusGroup[]);
  const deliveredCodes = statusCodesForGroups(["delivered" as StatusGroup]);
  const awaitingCodes = statusCodesForGroups(["awaiting_payment" as StatusGroup]);

  const [totalCustomers, newCustomers, totalShipments, activeShipments, deliveredShipments, packagesInWarehouse, pendingClaims, openTickets, awaitingPayment, verifiedAmounts] =
    await Promise.all([
      count((q) => notStaff(q.from("profiles").select("id", { count: "exact", head: true }))),
      count((q) =>
        notStaff(
          q
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("created_at", thirtyDaysAgo),
        ),
      ),
      count((q) => q.from("shipments").select("id", { count: "exact", head: true })),
      count((q) => q.from("shipments").select("id", { count: "exact", head: true }).in("current_status", activeCodes)),
      count((q) => q.from("shipments").select("id", { count: "exact", head: true }).in("current_status", deliveredCodes)),
      count((q) => q.from("shipment_packages").select("id", { count: "exact", head: true }).in("package_status", ["registered", "received", "assigned"])),
      count((q) => q.from("shipment_claim_requests").select("id", { count: "exact", head: true }).eq("request_status", "pending")),
      count((q) => q.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"])),
      count((q) => q.from("shipments").select("id", { count: "exact", head: true }).in("current_status", awaitingCodes)),
      supabase.from("shipment_payments").select("amount").eq("payment_status", "verified"),
    ]);

  const collected = (verifiedAmounts.data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return {
    totalCustomers,
    newCustomers30d: newCustomers,
    totalShipments,
    activeShipments,
    deliveredShipments,
    packagesInWarehouse,
    pendingClaims,
    openTickets,
    awaitingPayment,
    collectedPayments: collected.toFixed(2),
  };
}

/** Recent activity for the admin dashboard, all real rows. */
export async function getRecentActivity(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("id, actor_label, action, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((a) => ({
    id: a.id,
    actorLabel: a.actor_label,
    action: a.action,
    entityType: a.entity_type,
    entityId: a.entity_id,
    createdAt: a.created_at,
  }));
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export type CustomerFilters = { q?: string; status?: string; page?: number; perPage?: number };

export async function listCustomers(filters: CustomerFilters = {}) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));
  const staffIds = await getStaffIds();

  const base = () => {
    let q = supabase.from("profiles").select("id", { count: "exact", head: true });
    if (staffIds.length > 0) q = q.not("id", "in", `(${staffIds.map((i) => `"${i}"`).join(",")})`);
    return q;
  };

  const countQ = base();
  const rowsQ = supabase
    .from("profiles")
    .select("id, customer_number, full_name, phone, email, city, account_status, created_at")
    .order("created_at", { ascending: false });
  if (staffIds.length > 0) rowsQ.not("id", "in", `(${staffIds.map((i) => `"${i}"`).join(",")})`);

  if (filters.status === "active" || filters.status === "suspended") {
    countQ.eq("account_status", filters.status);
    rowsQ.eq("account_status", filters.status);
  }
  const needle = filters.q?.trim();
  if (needle) {
    const p = like(needle);
    const orStr = `full_name.ilike.${p},customer_number.ilike.${p},phone.ilike.${p},email.ilike.${p}`;
    countQ.or(orStr);
    rowsQ.or(orStr);
  }
  const from = (page - 1) * perPage;
  rowsQ.range(from, from + perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  return {
    rows: (rowsRes.data ?? []).map((c) => ({
      id: c.id,
      customerNumber: c.customer_number,
      fullName: c.full_name,
      phone: c.phone,
      email: c.email,
      city: c.city,
      accountStatus: c.account_status,
      createdAt: c.created_at,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export type CustomerDetail = {
  id: string;
  customerNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  city: string;
  accountStatus: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export async function getCustomerById(profileId: string): Promise<CustomerDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, customer_number, full_name, phone, email, city, account_status, created_at, updated_at")
    .eq("id", profileId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  // Roles live in user_roles; nobody there is a regular customer.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profileId);

  return {
    id: data.id,
    customerNumber: data.customer_number,
    fullName: data.full_name,
    phone: data.phone,
    email: data.email,
    city: data.city,
    accountStatus: data.account_status,
    role: roleRows?.[0]?.role ?? "customer",
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** Aggregate counters shown on the customer detail page. */
export async function getCustomerCounters(profileId: string) {
  const supabase = await createClient();
  const [shipments, packages, tickets] = await Promise.all([
    supabase.from("shipments").select("id", { count: "exact", head: true }).eq("customer_id", profileId),
    supabase.from("shipment_packages").select("id", { count: "exact", head: true }).eq("customer_id", profileId),
    supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("customer_id", profileId),
  ]);
  return {
    shipments: shipments.count ?? 0,
    packages: packages.count ?? 0,
    tickets: tickets.count ?? 0,
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
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const COLUMNS =
    "id, tracking_number, description, current_status, weight, package_count, payment_status, shipping_fee, currency, destination_city, customer_id, updated_at, profiles!customer_id(customer_number, full_name)";

  const countQ = supabase.from("shipments").select("id", { count: "exact", head: true });
  const rowsQ = supabase.from("shipments").select(COLUMNS);
  if (filters.group && filters.group !== "all") {
    const codes = statusCodesForGroups([filters.group as StatusGroup]);
    countQ.in("current_status", codes);
    rowsQ.in("current_status", codes);
  }
  if (filters.status && filters.status !== "all") {
    countQ.eq("current_status", filters.status);
    rowsQ.eq("current_status", filters.status);
  }
  const needle = filters.q?.trim();
  if (needle) {
    const p = like(needle);
    const orStr = `tracking_number.ilike.${p},description.ilike.${p}`;
    countQ.or(orStr);
    rowsQ.or(orStr);
  }
  rowsQ.order("updated_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  const rows = (rowsRes.data ?? []).map((row) => {
    const prof = row.profiles as unknown as { customer_number: string; full_name: string } | null;
    return {
      id: row.id,
      trackingNumber: row.tracking_number,
      description: row.description ?? "",
      currentStatus: row.current_status,
      statusGroup: groupOf(row.current_status),
      weight: str(row.weight),
      packageCount: row.package_count,
      paymentStatus: row.payment_status,
      shippingFee: str(row.shipping_fee),
      currency: row.currency,
      destinationCity: row.destination_city,
      customerId: row.customer_id,
      customerNumber: prof?.customer_number ?? null,
      customerName: prof?.full_name ?? null,
      updatedAt: row.updated_at,
    };
  });

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
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const COLUMNS =
    "id, package_reference, carrier_tracking_number, description, weight, dimensions, package_status, warehouse_received_at, notes, customer_id, created_at, profiles!customer_id(customer_number, full_name)";

  const countQ = supabase.from("shipment_packages").select("id", { count: "exact", head: true });
  const rowsQ = supabase.from("shipment_packages").select(COLUMNS);
  if (filters.status && filters.status !== "all") {
    countQ.eq("package_status", filters.status);
    rowsQ.eq("package_status", filters.status);
  }
  const needle = filters.q?.trim();
  if (needle) {
    const p = like(needle);
    const orStr = `package_reference.ilike.${p},carrier_tracking_number.ilike.${p}`;
    countQ.or(orStr);
    rowsQ.or(orStr);
  }
  rowsQ.order("created_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  const rows = (rowsRes.data ?? []).map((row) => {
    const prof = row.profiles as unknown as { customer_number: string; full_name: string } | null;
    return {
      id: row.id,
      packageReference: row.package_reference,
      carrierTrackingNumber: row.carrier_tracking_number,
      description: row.description,
      weight: str(row.weight),
      dimensions: dimToStr(row.dimensions),
      packageStatus: row.package_status,
      warehouseReceivedAt: row.warehouse_received_at,
      notes: row.notes,
      customerId: row.customer_id,
      customerNumber: prof?.customer_number ?? null,
      customerName: prof?.full_name ?? null,
      createdAt: row.created_at,
    };
  });

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/* ------------------------------------------------------------------ */
/* Claims, tickets, payments, audit                                    */
/* ------------------------------------------------------------------ */

export async function listAllClaims(filters: { status?: string; page?: number; perPage?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const COLUMNS =
    "id, shipment_tracking_number, carrier_tracking_number, description, request_status, review_note, shipment_id, customer_id, created_at, reviewed_at, profiles!customer_id(customer_number, full_name, phone)";

  const countQ = supabase.from("shipment_claim_requests").select("id", { count: "exact", head: true });
  const rowsQ = supabase.from("shipment_claim_requests").select(COLUMNS);
  if (filters.status && filters.status !== "all") {
    countQ.eq("request_status", filters.status);
    rowsQ.eq("request_status", filters.status);
  }
  rowsQ.order("created_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  const rows = (rowsRes.data ?? []).map((row) => {
    const prof = row.profiles as unknown as
      | { customer_number: string; full_name: string; phone: string }
      | null;
    return {
      id: row.id,
      shipmentTrackingNumber: row.shipment_tracking_number,
      carrierTrackingNumber: row.carrier_tracking_number,
      description: row.description,
      requestStatus: row.request_status,
      reviewNote: row.review_note,
      shipmentId: row.shipment_id,
      customerId: row.customer_id,
      customerNumber: prof?.customer_number ?? null,
      customerName: prof?.full_name ?? null,
      customerPhone: prof?.phone ?? null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    };
  });

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listAllTickets(filters: { status?: string; page?: number; perPage?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const COLUMNS =
    "id, ticket_number, subject, description, status, priority, reply, replied_at, customer_id, created_at, profiles!customer_id(customer_number, full_name)";

  const countQ = supabase.from("support_tickets").select("id", { count: "exact", head: true });
  const rowsQ = supabase.from("support_tickets").select(COLUMNS);
  if (filters.status && filters.status !== "all") {
    countQ.eq("status", filters.status);
    rowsQ.eq("status", filters.status);
  }
  rowsQ.order("created_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  const rows = (rowsRes.data ?? []).map((row) => {
    const prof = row.profiles as unknown as { customer_number: string; full_name: string } | null;
    return {
      id: row.id,
      ticketNumber: row.ticket_number,
      subject: row.subject,
      description: row.description,
      status: row.status,
      priority: row.priority,
      reply: row.reply,
      repliedAt: row.replied_at,
      customerId: row.customer_id,
      customerNumber: prof?.customer_number ?? null,
      customerName: prof?.full_name ?? null,
      createdAt: row.created_at,
    };
  });

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listAllPayments(filters: { status?: string; page?: number; perPage?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 15));

  const COLUMNS =
    "id, amount, currency, payment_method, payment_status, transaction_reference, notes, recorded_at, shipment_id, shipments!shipment_id(tracking_number, customer_id, profiles!customer_id(customer_number, full_name))";

  const countQ = supabase.from("shipment_payments").select("id", { count: "exact", head: true });
  const rowsQ = supabase.from("shipment_payments").select(COLUMNS);
  if (filters.status && filters.status !== "all") {
    countQ.eq("payment_status", filters.status);
    rowsQ.eq("payment_status", filters.status);
  }
  rowsQ.order("recorded_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  const rows = (rowsRes.data ?? []).map((row) => {
    const ship = row.shipments as unknown as
      | { tracking_number: string; customer_id: string; profiles: { customer_number: string; full_name: string } | null }
      | null;
    return {
      id: row.id,
      amount: String(row.amount),
      currency: row.currency,
      paymentMethod: row.payment_method,
      paymentStatus: row.payment_status,
      transactionReference: row.transaction_reference,
      notes: row.notes,
      recordedAt: row.recorded_at,
      shipmentId: row.shipment_id,
      trackingNumber: ship?.tracking_number ?? null,
      customerId: ship?.customer_id ?? null,
      customerNumber: ship?.profiles?.customer_number ?? null,
      customerName: ship?.profiles?.full_name ?? null,
    };
  });

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listAuditLogs(filters: { q?: string; page?: number; perPage?: number }) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? 20));

  const countQ = supabase.from("audit_logs").select("id", { count: "exact", head: true });
  const rowsQ = supabase
    .from("audit_logs")
    .select("id, actor_label, action, entity_type, entity_id, metadata, created_at");
  const needle = filters.q?.trim();
  if (needle) {
    const p = like(needle);
    const orStr = `action.ilike.${p},actor_label.ilike.${p},entity_type.ilike.${p}`;
    countQ.or(orStr);
    rowsQ.or(orStr);
  }
  rowsQ.order("created_at", { ascending: false }).range((page - 1) * perPage, page * perPage - 1);

  const [countRes, rowsRes] = await Promise.all([countQ, rowsQ]);
  const total = countRes.count ?? 0;

  const rows = (rowsRes.data ?? []).map((a) => ({
    id: a.id,
    actorLabel: a.actor_label,
    action: a.action,
    entityType: a.entity_type,
    entityId: a.entity_id,
    metadata: a.metadata,
    createdAt: a.created_at,
  }));

  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/* ------------------------------------------------------------------ */
/* Status catalogue                                                    */
/* ------------------------------------------------------------------ */

export async function listStatusCatalog() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_status_catalog")
    .select("code, label_ar, sort_order, is_active, is_exception, is_terminal, restricted")
    .order("sort_order", { ascending: true });

  return (data ?? []).map((row) => ({
    code: row.code,
    labelAr: row.label_ar,
    group: groupOf(row.code),
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isException: row.is_exception,
    isTerminal: row.is_terminal,
    restricted: row.restricted,
  }));
}

export async function listStatusTransitions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_status_transitions")
    .select("id, from_status, to_status, is_active, requires_role");

  return (data ?? []).map((t) => ({
    id: t.id,
    fromStatus: t.from_status,
    toStatus: t.to_status,
    isActive: t.is_active,
    requiresRole: t.requires_role,
  }));
}

/* ------------------------------------------------------------------ */
/* Recent shipment events (for the dashboard feed)                     */
/* ------------------------------------------------------------------ */

export async function getRecentShipmentEvents(limit = 8) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipment_events")
    .select("id, status, location, description, event_timestamp, shipment_id, shipments!shipment_id(tracking_number)")
    .order("event_timestamp", { ascending: false })
    .limit(limit);

  return (data ?? []).map((e) => {
    const ship = e.shipments as unknown as { tracking_number: string } | null;
    return {
      id: e.id,
      status: e.status,
      statusGroup: groupOf(e.status),
      location: e.location,
      description: e.description,
      eventTimestamp: e.event_timestamp,
      trackingNumber: ship?.tracking_number ?? null,
      shipmentId: e.shipment_id,
    };
  });
}
