"use client";

import { useState, type ReactNode } from "react";

import { SidebarContent, type PortalUser } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Responsive application frame:
 *  - fixed dark sidebar on large screens (RTL: pinned to the right edge)
 *  - off-canvas drawer on small screens
 */
export function PortalChrome({
  user,
  unreadCount,
  children,
}: {
  user: PortalUser;
  unreadCount: number;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">
        <SidebarContent user={user} unreadCount={unreadCount} />
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
            <SidebarContent
              user={user}
              unreadCount={unreadCount}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="lg:ms-64">
        <Topbar user={user} unreadCount={unreadCount} onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
