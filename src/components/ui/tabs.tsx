import Link from "next/link";
import { cn } from "@/lib/utils";
import { buildHref } from "./pagination";

export type TabItem = {
  label: string;
  value: string;
  count?: number;
};

/**
 * URL driven tab bar (server component). Filtering therefore survives a page
 * refresh and works without JavaScript.
 */
export function TabNav({
  items,
  basePath,
  paramKey = "status",
  params,
  className,
}: {
  items: TabItem[];
  basePath: string;
  paramKey?: string;
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar flex gap-1.5 overflow-x-auto rounded-xl border border-line bg-surface-muted p-1.5",
        className,
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = (params?.[paramKey] ?? "all") === item.value;
        return (
          <Link
            key={item.value}
            role="tab"
            aria-selected={active}
            href={buildHref(basePath, { ...params, [paramKey]: item.value }, 1)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-[13px] font-bold transition-colors",
              active
                ? "bg-white text-ink shadow-card"
                : "text-muted hover:bg-white/60 hover:text-ink",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                  active ? "bg-brand-soft text-brand-dark" : "bg-white text-subtle",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
