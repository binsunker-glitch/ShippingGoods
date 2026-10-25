import type { ProfileRole } from "@/db/schema";

export type Permission =
  | "customers.read"
  | "customers.write"
  | "customers.suspend"
  | "shipments.read"
  | "shipments.write"
  | "shipments.status"
  | "shipments.fees"
  | "warehouse.read"
  | "warehouse.write"
  | "consolidation.confirm"
  | "payments.read"
  | "payments.write"
  | "claims.read"
  | "claims.review"
  | "statuses.manage"
  | "support.read"
  | "support.reply"
  | "audit.read"
  | "settings.manage";

const ALL: Permission[] = [
  "customers.read",
  "customers.write",
  "customers.suspend",
  "shipments.read",
  "shipments.write",
  "shipments.status",
  "shipments.fees",
  "warehouse.read",
  "warehouse.write",
  "consolidation.confirm",
  "payments.read",
  "payments.write",
  "claims.read",
  "claims.review",
  "statuses.manage",
  "support.read",
  "support.reply",
  "audit.read",
  "settings.manage",
];

const MATRIX: Record<ProfileRole, Permission[]> = {
  super_admin: ALL,
  operations_manager: [
    "customers.read",
    "customers.write",
    "shipments.read",
    "shipments.write",
    "shipments.status",
    "shipments.fees",
    "warehouse.read",
    "warehouse.write",
    "consolidation.confirm",
    "payments.read",
    "claims.read",
    "claims.review",
    "statuses.manage",
    "support.read",
    "support.reply",
    "audit.read",
  ],
  warehouse_staff: [
    "shipments.read",
    "warehouse.read",
    "warehouse.write",
    "claims.read",
    "payments.read",
  ],
  support: [
    "customers.read",
    "shipments.read",
    "claims.read",
    "payments.read",
    "support.read",
    "support.reply",
  ],
  finance: [
    "customers.read",
    "shipments.read",
    "shipments.fees",
    "payments.read",
    "payments.write",
    "audit.read",
  ],
  customer: [],
};

export function can(role: ProfileRole | string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = MATRIX[role as ProfileRole];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function permissionsFor(role: ProfileRole | string | null | undefined): Permission[] {
  if (!role) return [];
  return MATRIX[role as ProfileRole] ?? [];
}

export function isAdminRole(role: ProfileRole | string | null | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.includes(role as ProfileRole);
}

/** Every role that may enter the admin console (everything except customers). */
const STAFF_ROLES: ProfileRole[] = [
  "super_admin",
  "operations_manager",
  "warehouse_staff",
  "support",
  "finance",
];

/** Navigation shown in the admin console, filtered by the actor's role. */
export function adminNavigation(role: ProfileRole | string | null | undefined): NavItem[] {
  return ADMIN_NAV.filter((item) => can(role, item.permission));
}

export type NavItem = {
  label: string;
  href: string;
  permission: Permission;
  icon: string;
};

export const ADMIN_NAV: NavItem[] = [
  { label: "لوحة التحكم", href: "/admin", permission: "shipments.read", icon: "layout" },
  { label: "العملاء", href: "/admin/customers", permission: "customers.read", icon: "users" },
  { label: "الشحنات", href: "/admin/shipments", permission: "shipments.read", icon: "package" },
  { label: "عمليات المستودع", href: "/admin/warehouse", permission: "warehouse.read", icon: "warehouse" },
  { label: "طلبات ربط الطرود", href: "/admin/claims", permission: "claims.read", icon: "link" },
  { label: "المدفوعات", href: "/admin/payments", permission: "payments.read", icon: "credit-card" },
  { label: "تذاكر الدعم", href: "/admin/support", permission: "support.read", icon: "life-buoy" },
  { label: "حالات الشحن", href: "/admin/statuses", permission: "statuses.manage", icon: "git-branch" },
  { label: "سجل التدقيق", href: "/admin/audit", permission: "audit.read", icon: "shield" },
];
