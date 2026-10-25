"use client";

import { useState, type ReactNode } from "react";
import { Menu, Shield } from "lucide-react";

import { AdminSidebarContent, type AdminUser } from "./sidebar";

/** Responsive admin frame, mirroring the customer portal shell. */
export function AdminChrome({
  user,
  allowedPermissions,
  children,
}: {
  user: AdminUser;
  allowedPermissions: string[];
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">
        <AdminSidebarContent user={user} allowedPermissions={allowedPermissions} />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-navy/55"
          />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85%] shadow-pop">
            <AdminSidebarContent
              user={user}
              allowedPermissions={allowedPermissions}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:ms-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="فتح القائمة"
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-muted hover:text-ink lg:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <div className="flex items-center gap-2 text-sm font-bold text-ink">
              <Shield className="size-4 text-brand" aria-hidden />
              لوحة الإدارة
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden text-end sm:block">
              <p className="text-[13px] font-bold text-ink">{user.fullName}</p>
              <p className="text-[11px] font-semibold text-muted">{user.roleLabel}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full bg-navy text-[12px] font-extrabold text-white">
              {user.fullName.trim().charAt(0)}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
