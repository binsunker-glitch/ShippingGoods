import type { BadgeVariant } from "@/components/ui/badge";
import type { StatusGroup } from "@/db/schema";

export const APP_NAME = "World Associates Shipping CO";
export const APP_NAME_AR = "World Associates Shipping CO";
export const WAREHOUSE_CITY = "Guangzhou, China";
export const CURRENCY = "SAR";

/** Saudi cities offered in the address forms (customers may type their own). */
export const SAUDI_CITIES = [
  "الرياض",
  "جدة",
  "مكة المكرمة",
  "المدينة المنورة",
  "الدمام",
  "الخبر",
  "الظهران",
  "القطيف",
  "الأحساء",
  "بريدة",
  "خميس مشيط",
  "أبها",
  "تبوك",
  "حائل",
  "الطائف",
  "ينبع",
  "جدة الشمالية",
  "الجبيل",
  "ينبع البحر",
  "نجران",
  "جازان",
  "الباحة",
  "سكاكا",
  "عرعر",
  "رأس تنورة",
  "المدينة الصناعية الجديدة",
  "أخرى",
] as const;

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  warehouse: "في المستودع",
  ready: "جاهزة للتجميع",
  awaiting_payment: "بانتظار الدفع",
  in_transit: "قيد الشحن",
  delivered: "تم التسليم",
  exception: "استثناء",
  cancelled: "ملغاة",
};

/**
 * Canonical mapping of each shipment status code to its dashboard/tab group.
 * Must stay in sync with `shipment_status_catalog.group_name` seeded by
 * `supabase/migrations/0004_seed.sql`. Queries filter shipments by explicit
 * code lists derived from this map.
 */
export const STATUS_GROUP_BY_CODE: Record<string, StatusGroup> = {
  created: "warehouse",
  awaiting_package: "warehouse",
  received_at_warehouse: "warehouse",
  registered: "warehouse",
  ready_for_consolidation: "ready",
  consolidating: "ready",
  ready_to_ship: "ready",
  awaiting_payment: "awaiting_payment",
  paid: "in_transit",
  shipped_from_china: "in_transit",
  arrived_in_saudi_arabia: "in_transit",
  customs_clearance: "in_transit",
  handed_to_local_carrier: "in_transit",
  out_for_delivery: "in_transit",
  delivered: "delivered",
  delayed: "exception",
  delivery_failed: "exception",
  cancelled: "cancelled",
};

/** All status codes belonging to one or more groups (for SQL `IN` filters). */
export function statusCodesForGroups(groups: StatusGroup[]): string[] {
  return Object.entries(STATUS_GROUP_BY_CODE)
    .filter(([, group]) => groups.includes(group))
    .map(([code]) => code);
}

export const STATUS_GROUP_VARIANTS: Record<StatusGroup, BadgeVariant> = {
  warehouse: "info",
  ready: "violet",
  awaiting_payment: "warning",
  in_transit: "brand",
  delivered: "success",
  exception: "danger",
  cancelled: "neutral",
};

/** Tabs used by the shipment list pages. */
export const SHIPMENT_TABS = [
  { label: "كل الشحنات", value: "all" },
  { label: "المستودع", value: "warehouse" },
  { label: "جاهزة للتجميع", value: "ready" },
  { label: "بانتظار الدفع", value: "awaiting_payment" },
  { label: "قيد الشحن", value: "in_transit" },
  { label: "تم التسليم", value: "delivered" },
] as const;

export const PACKAGE_STATUS_LABELS: Record<string, string> = {
  awaiting_identification: "بانتظار التسجيل",
  received: "مستلم في المستودع",
  registered: "مسجل",
  assigned: "جاهز للتجميع",
  consolidated: "مُجمّع",
  shipped: "قيد الشحن",
  delivered: "تم التسليم",
};

export const PACKAGE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  awaiting_identification: "warning",
  received: "info",
  registered: "neutral",
  assigned: "violet",
  consolidated: "brand",
  shipped: "brand",
  delivered: "success",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "غير مدفوع",
  pending_verification: "بانتظار التحقق",
  partially_paid: "مدفوعة جزئياً",
  paid: "تم الدفع",
  refunded: "مسترد",
};

export const PAYMENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  unpaid: "warning",
  pending_verification: "info",
  partially_paid: "warning",
  paid: "success",
  refunded: "neutral",
};

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

export const CLAIM_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  answered: "تم الرد",
  closed: "مغلقة",
};

export const TICKET_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  open: "warning",
  in_progress: "info",
  answered: "success",
  closed: "neutral",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

export const ROLE_LABELS: Record<string, string> = {
  customer: "عميل",
  super_admin: "مدير عام",
  operations_manager: "مدير عمليات",
  warehouse_staff: "موظف مستودع",
  customer_support: "دعم العملاء",
  finance_staff: "المالية",
};

export const ROLE_LABELS_SHORT: Record<string, string> = {
  customer: "عميل",
  super_admin: "مدير عام",
  operations_manager: "عمليات",
  warehouse_staff: "مستودع",
  customer_support: "دعم",
  finance_staff: "مالية",
};

/** Payment integration availability, read from the environment. */
export function paymentGatewayEnabled(): boolean {
  return process.env.PAYMENT_GATEWAY_ENABLED === "true";
}

export function paymentGatewayName(): string {
  const name = process.env.PAYMENT_GATEWAY_NAME?.trim();
  if (!paymentGatewayEnabled() || !name) return "";
  return name;
}
