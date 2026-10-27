import "server-only";

import { STATUS_GROUP_BY_CODE, statusCodesForGroups } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AddressSnapshot, StatusGroup } from "@/db/schema";

export const DEFAULT_PER_PAGE = 10;

export type ShipmentFilters = {
  q?: string;
  status?: string;
  sort?: "newest" | "oldest" | "updated";
  page?: number;
  perPage?: number;
};

/** Derives the dashboard/tab group for a status code (never stored in DB). */
function groupOf(code: string): StatusGroup {
  return STATUS_GROUP_BY_CODE[code] ?? "warehouse";
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** dimensions is JSONB; the UI renders it as a plain string. */
function dimToStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const SHIPMENT_COLUMNS =
  "id, tracking_number, customer_id, description, package_count, weight, dimensions, shipping_method, origin, destination_city, destination_address_snapshot, current_status, estimated_delivery_date, estimated_delivery, shipping_fee, currency, payment_status, consolidation_group_id, notes, address_id, recipient_phone, created_at, updated_at";

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
  createdAt: string;
  updatedAt: string;
};

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
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.max(1, Math.min(50, filters.perPage ?? DEFAULT_PER_PAGE));

  const groupFilter = filters.status && filters.status !== "all" ? filters.status : null;
  const needle = filters.q?.trim();
  const pattern = needle ? `%${needle.replace(/[%_,()]/g, " ")}%` : null;

  // Rows (filtered, ordered, paginated).
  const query = supabase
    .from("shipments")
    .select(
      "id, tracking_number, description, current_status, weight, origin, destination_city, package_count, payment_status, shipping_fee, currency, created_at, updated_at",
    )
    .eq("customer_id", customerId);
  if (groupFilter) query.in("current_status", statusCodesForGroups([groupFilter as StatusGroup]));
  if (pattern) query.or(`tracking_number.ilike.${pattern},description.ilike.${pattern}`);
  if (filters.sort === "oldest") query.order("created_at", { ascending: true });
  else if (filters.sort === "updated") query.order("updated_at", { ascending: false });
  else query.order("created_at", { ascending: false });
  const from = (page - 1) * perPage;
  query.range(from, from + perPage - 1);

  // Total under the same filters (head count, no rows transferred).
  const countQuery = supabase
    .from("shipments")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);
  if (groupFilter) countQuery.in("current_status", statusCodesForGroups([groupFilter as StatusGroup]));
  if (pattern) countQuery.or(`tracking_number.ilike.${pattern},description.ilike.${pattern}`);

  // Unfiltered statuses for tab counts.
  const allQuery = supabase.from("shipments").select("current_status").eq("customer_id", customerId);

  const [rowsRes, countRes, allRes] = await Promise.all([query, countQuery, allQuery]);
  const total = countRes.count ?? 0;

  // Tab counts derived from every shipment's status code.
  const counts: Record<string, number> = { all: 0 };
  for (const row of allRes.data ?? []) {
    const g = groupOf(row.current_status);
    counts[g] = (counts[g] ?? 0) + 1;
    counts.all += 1;
  }

  const rows: ShipmentListItem[] = (rowsRes.data ?? []).map((row) => ({
    id: row.id,
    trackingNumber: row.tracking_number,
    description: row.description ?? "",
    currentStatus: row.current_status,
    statusGroup: groupOf(row.current_status),
    weight: str(row.weight),
    origin: row.origin,
    destinationCity: row.destination_city,
    packageCount: row.package_count,
    paymentStatus: row.payment_status,
    shippingFee: str(row.shipping_fee),
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

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

export type ShipmentCore = {
  id: string;
  trackingNumber: string;
  customerId: string | null;
  description: string | null;
  packageCount: number;
  weight: string | null;
  dimensions: string | null;
  shippingMethod: string | null;
  origin: string;
  destinationCity: string | null;
  destinationAddressSnapshot: AddressSnapshot | null;
  addressId: string | null;
  recipientPhone: string | null;
  currentStatus: string;
  statusGroup: StatusGroup;
  estimatedDeliveryDate: string | null;
  estimatedDelivery: boolean;
  shippingFee: string | null;
  currency: string;
  paymentStatus: string;
  consolidationGroupId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

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
    warehouseReceivedAt: string | null;
  }[];
  payments: {
    id: string;
    amount: string;
    currency: string;
    paymentMethod: string | null;
    paymentStatus: string;
    transactionReference: string | null;
    recordedAt: string | null;
  }[];
};

function toCore(row: Record<string, unknown>): ShipmentCore {
  return {
    id: row.id as string,
    trackingNumber: row.tracking_number as string,
    customerId: (row.customer_id as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    packageCount: row.package_count as number,
    weight: str(row.weight),
    dimensions: dimToStr(row.dimensions),
    shippingMethod: (row.shipping_method as string | null) ?? null,
    origin: row.origin as string,
    destinationCity: (row.destination_city as string | null) ?? null,
    destinationAddressSnapshot: (row.destination_address_snapshot as AddressSnapshot | null) ?? null,
    addressId: (row.address_id as string | null) ?? null,
    recipientPhone: (row.recipient_phone as string | null) ?? null,
    currentStatus: row.current_status as string,
    statusGroup: groupOf(row.current_status as string),
    estimatedDeliveryDate: (row.estimated_delivery_date as string | null) ?? null,
    estimatedDelivery: Boolean(row.estimated_delivery),
    shippingFee: str(row.shipping_fee),
    currency: row.currency as string,
    paymentStatus: row.payment_status as string,
    consolidationGroupId: (row.consolidation_group_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function hydrate(core: ShipmentCore): Promise<ShipmentDetail> {
  const supabase = await createClient();

  const [eventsRes, packagesRes, paymentsRes] = await Promise.all([
    supabase
      .from("shipment_events")
      .select("id, status, location, description, event_timestamp, source, created_by")
      .eq("shipment_id", core.id)
      .order("event_timestamp", { ascending: true }),
    supabase
      .from("shipment_packages")
      .select(
        "id, package_reference, carrier_tracking_number, description, weight, dimensions, package_status, warehouse_received_at, created_at",
      )
      .eq("shipment_id", core.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("shipment_payments")
      .select("id, amount, currency, payment_method, payment_status, transaction_reference, recorded_at")
      .eq("shipment_id", core.id)
      .order("recorded_at", { ascending: false }),
  ]);

  // Resolve actor display names (created_by has no FK, so resolve in a 2nd pass).
  const actorIds = [...new Set((eventsRes.data ?? []).map((e) => e.created_by).filter(Boolean))] as string[];
  let names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    names = new Map((data ?? []).map((p) => [p.id, p.full_name]));
  }

  let customerNumber: string | null = null;
  let customerName: string | null = null;
  if (core.customerId) {
    const { data } = await supabase
      .from("profiles")
      .select("customer_number, full_name")
      .eq("id", core.customerId)
      .maybeSingle();
    customerNumber = data?.customer_number ?? null;
    customerName = data?.full_name ?? null;
  }

  return {
    ...core,
    customerNumber,
    customerName,
    events: (eventsRes.data ?? []).map((e) => ({
      id: e.id,
      status: e.status,
      statusGroup: groupOf(e.status),
      location: e.location,
      description: e.description ?? "",
      eventTimestamp: new Date(e.event_timestamp),
      source: e.source ?? "staff",
      actorName: e.created_by ? names.get(e.created_by) ?? null : null,
    })),
    packages: (packagesRes.data ?? []).map((p) => ({
      id: p.id,
      packageReference: p.package_reference,
      carrierTrackingNumber: p.carrier_tracking_number,
      description: p.description,
      weight: str(p.weight),
      dimensions: dimToStr(p.dimensions),
      packageStatus: p.package_status,
      warehouseReceivedAt: p.warehouse_received_at,
    })),
    payments: (paymentsRes.data ?? []).map((p) => ({
      id: p.id,
      amount: String(p.amount),
      currency: p.currency,
      paymentMethod: p.payment_method,
      paymentStatus: p.payment_status,
      transactionReference: p.transaction_reference,
      recordedAt: p.recorded_at,
    })),
  };
}

/** Customer view: ownership is part of the query (IDOR protection). */
export async function getCustomerShipmentDetail(
  customerId: string,
  idOrTracking: string,
): Promise<ShipmentDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS)
    .eq("customer_id", customerId)
    .or(`id.eq.${idOrTracking},tracking_number.eq.${idOrTracking}`)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return hydrate(toCore(data));
}

/** Staff view: no ownership filter (guarded by a permission check upstream). */
export async function getAdminShipmentDetail(idOrTracking: string): Promise<ShipmentDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS)
    .or(`id.eq.${idOrTracking},tracking_number.eq.${idOrTracking}`)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return hydrate(toCore(data));
}
