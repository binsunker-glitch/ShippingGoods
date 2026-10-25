"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  GitBranch,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  Package,
  Shield,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { logoutAction } from "@/server/actions/auth";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export type AdminUser = {
  fullName: string;
  customerNumber: string;
  role: string;
  roleLabel: string;
};

type AdminNavItem = {
  label: string;
  href: string;
  permission: Permission;
  icon: LucideIcon;
  exact?: boolean;
};

/** Role filtering happens on the server; this list is already filtered. */
export const ADMIN_NAV: AdminNavItem[] = [
  { label: "لوحة التحكم", href: "/admin", permission: "shipments.read", icon: LayoutDashboard, exact: true },
  { label: "العملاء", href: "/admin/customers", permission: "customers.read", icon: Users },
  { label: "الشحنات", href: "/admin/shipments", permission: "shipments.read", icon: Package },
  { label: "عمليات المستودع", href: "/admin/warehouse", permission: "warehouse.read", icon: Warehouse },
  { label: "طلبات ربط الطرود", href: "/admin/claims", permission: "claims.read", icon: Link2 },
  { label: "المدفوعات", href: "/admin/payments", permission: "payments.read", icon: CreditCard },
  { label: "تذاكر الدعم", href: "/admin/support", permission: "support.read", icon: LifeBuoy },
  { label: "حالات الشحن", href: "/admin/statuses", permission: "statuses.manage", icon: GitBranch },
  { label: "سجل التدقيق", href: "/admin/audit", permission: "audit.read", icon: Shield },
];

export function AdminSidebarContent({
  user,
  allowedPermissions,
  onClose,
}: {
  user: AdminUser;
  allowedPermissions: string[];
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const items = ADMIN_NAV.filter((item) => allowedPermissions.includes(item.permission));

  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="flex items-center justify-between gap-3 px-5 py-5">
        <Logo variant="light" size="sm" showTagline={false} />
        <span className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-[10px] font-bold tracking-wide text-brand">
          إدارة
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="mx-4 mb-4 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3">
        <p className="truncate text-[13px] font-bold text-white">{user.fullName}</p>
        <p className="mt-1 truncate text-[11px] font-semibold text-brand">{user.roleLabel}</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="قائمة الإدارة">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
                active
                  ? "bg-white/[0.10] text-white"
                  : "text-white/65 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {active ? (
                <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-brand" aria-hidden />
              ) : null}
              <Icon className="size-4.5 shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <LogOut className="size-4.5" aria-hidden />
            تسجيل الخروج
          </button>
        </form>
      </div>
    </div>
  );
}
