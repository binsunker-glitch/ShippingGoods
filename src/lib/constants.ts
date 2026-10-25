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
  registered: "مسجل",
  received: "مستلم في المستودع",
  ready: "جاهز للتجميع",
  consolidated: "مُجمّع",
  in_transit: "قيد الشحن",
  delivered: "تم التسليم",
  exception: "استثناء",
};

export const PACKAGE_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  registered: "neutral",
  received: "info",
  ready: "violet",
  consolidated: "brand",
  in_transit: "brand",
  delivered: "success",
  exception: "danger",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "غير مدفوع",
  pending_verification: "بانتظار التحقق",
  paid: "تم الدفع",
  refunded: "مسترد",
};

export const PAYMENT_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  unpaid: "warning",
  pending_verification: "info",
  paid: "success",
  refunded: "neutral",
};

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  auto_verified: "تم التحقق تلقائياً",
  approved: "معتمد",
  rejected: "مرفوض",
};

export const CLAIM_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  auto_verified: "info",
  approved: "success",
  rejected: "danger",
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
  support: "دعم العملاء",
  finance: "المالية",
};

export const ROLE_LABELS_SHORT: Record<string, string> = {
  customer: "عميل",
  super_admin: "مدير عام",
  operations_manager: "عمليات",
  warehouse_staff: "مستودع",
  support: "دعم",
  finance: "مالية",
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
