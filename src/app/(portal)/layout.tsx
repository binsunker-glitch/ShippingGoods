import { Suspense } from "react";

import { PortalShell } from "./shell";

/**
 * Customer portal layout.
 *
 * The session read sits inside a <Suspense> boundary, which is the required
 * pattern with Cache Components enabled: the authenticated shell streams in at
 * request time while nothing user-specific is ever prerendered.
 *
 * next.config.ts sets `instantInsights.validationLevel: "manual-warning"`, so
 * this auth-gated segment is not subject to instant-navigation validation: the
 * validation pass renders without the session cookie, which would fire the
 * guard's redirect() to /login and hijack real navigations. Instead the route
 * blocks on the server and the guard always sees the real request's session.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PortalSkeleton />}>
      <PortalShell>{children}</PortalShell>
    </Suspense>
  );
}

function PortalSkeleton() {
  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 bg-navy lg:block">
        <div className="space-y-4 px-5 py-6">
          <div className="skeleton-fill h-10 w-40 rounded-lg" />
          <div className="skeleton-fill h-16 w-full rounded-xl" />
          <div className="space-y-2.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="skeleton-fill h-9 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </aside>
      <div className="lg:ms-64">
        <div className="h-16 border-b border-line bg-surface" />
        <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
          <div className="h-40 w-full skeleton-fill rounded-card" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 skeleton-fill rounded-card" />
            ))}
          </div>
          <div className="h-72 w-full skeleton-fill rounded-card" />
        </div>
      </div>
    </div>
  );
}
