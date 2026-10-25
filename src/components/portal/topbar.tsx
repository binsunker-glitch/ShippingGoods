"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, UserCog, LifeBuoy } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import type { PortalUser } from "./sidebar";
import { logoutAction } from "@/server/actions/auth";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0] ?? "").join("");
}

export function Topbar({
  user,
  unreadCount,
  onOpenMenu,
}: {
  user: PortalUser;
  unreadCount: number;
  onOpenMenu: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="فتح القائمة"
          className="grid size-9 place-items-center rounded-lg border border-line-strong text-ink lg:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>

        <div className="hidden min-w-0 sm:block">
          <p className="text-[13px] font-bold text-ink">بوابة عملاء الشحن</p>
          <p className="text-[11px] text-muted">Guangzhou, China ← المملكة العربية السعودية</p>
        </div>

        <div className="ms-auto flex items-center gap-2">
          <span className="hidden md:inline-flex">
            <CopyButton value={user.customerNumber} label="نسخ رقم العميل" variant="outline" />
          </span>

          <Link
            href="/notifications"
            aria-label="الإشعارات"
            className="relative grid size-9 place-items-center rounded-lg border border-line-strong text-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Bell className="size-4.5" aria-hidden />
            {unreadCount > 0 ? (
              <span className="tabular absolute -top-1.5 -end-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 py-0.5 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex h-9 items-center gap-2 rounded-lg border border-line-strong ps-1.5 pe-2 transition-colors hover:bg-surface-muted"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-navy text-[12px] font-bold text-white">
                {initials(user.fullName)}
              </span>
              <span className="hidden max-w-36 truncate text-[13px] font-bold text-ink sm:block">
                {user.fullName}
              </span>
              <ChevronDown className="size-3.5 text-muted" aria-hidden />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute end-0 top-11 z-30 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
              >
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-[13px] font-bold text-ink">{user.fullName}</p>
                  <p className="tabular mt-0.5 text-[11px] font-semibold text-muted">
                    {user.customerNumber}
                  </p>
                </div>
                <Link
                  href="/account"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  <UserCog className="size-4 text-muted" aria-hidden />
                  حسابي
                </Link>
                <Link
                  href="/help"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-muted"
                >
                  <LifeBuoy className="size-4 text-muted" aria-hidden />
                  مركز المساعدة
                </Link>
                <form action={logoutAction} className="border-t border-line">
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-soft"
                  >
                    <LogOut className="size-4" aria-hidden />
                    تسجيل الخروج
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
