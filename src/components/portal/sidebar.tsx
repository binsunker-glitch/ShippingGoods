"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  MapPin,
  Package,
  Truck,
  UserCog,
  X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { logoutAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

export type PortalUser = {
  fullName: string;
  customerNumber: string;
  role: string;
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const PORTAL_NAV: NavItem[] = [
  { label: "الرئيسية", href: "/dashboard", icon: LayoutDashboard, exact: true },
  { label: "طرودي", href: "/packages", icon: Package },
  { label: "ربط طرد", href: "/link-shipment", icon: Link2 },
  { label: "التجميع والشحن", href: "/consolidation", icon: Boxes },
  { label: "شحناتي", href: "/shipments", icon: Truck },
  { label: "عناويني", href: "/addresses", icon: MapPin },
  { label: "المدفوعات", href: "/payments", icon: CreditCard },
  { label: "مركز المساعدة", href: "/help", icon: LifeBuoy },
  { label: "حسابي", href: "/account", icon: UserCog },
];

export function SidebarContent({
  user,
  onClose,
  unreadCount,
}: {
  user: PortalUser;
  onClose?: () => void;
  unreadCount: number;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-navy text-white">
      <div className="flex items-center justify-between gap-3 px-5 py-5">
        <Logo variant="light" />
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
        <p className="tabular mt-1 text-[11px] font-semibold text-brand">
          رقم العميل: {user.customerNumber}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="القائمة الرئيسية">
        {PORTAL_NAV.map((item) => {
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
              {item.href === "/notifications" && unreadCount > 0 ? (
                <span className="tabular rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                  {unreadCount}
                </span>
              ) : null}
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
