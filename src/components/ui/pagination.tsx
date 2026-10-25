import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function buildHref(
  basePath: string,
  params: Record<string, string | undefined> | undefined,
  page: number,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value && value !== "" && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Server-side pagination control. Every page is a real URL so refresh,
 * back button and sharing all keep working.
 */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
  className,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const numbers = pageNumbers(page, totalPages);

  return (
    <nav
      aria-label="تنقل بين الصفحات"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3",
        className,
      )}
    >
      <p className="text-xs text-muted">
        الصفحة <span className="tabular font-bold text-ink">{page}</span> من{" "}
        <span className="tabular font-bold text-ink">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link
            href={buildHref(basePath, params, page - 1)}
            rel="prev"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            <ChevronRight className="size-4" aria-hidden />
            السابق
          </Link>
        ) : null}

        {numbers.map((value, index) =>
          value === "…" ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-subtle">
              …
            </span>
          ) : (
            <Link
              key={value}
              href={buildHref(basePath, params, value)}
              aria-current={value === page ? "page" : undefined}
              className={cn(
                "tabular inline-grid size-9 place-items-center rounded-lg text-[13px] font-bold transition-colors",
                value === page
                  ? "bg-brand text-white"
                  : "border border-line-strong bg-white text-ink hover:bg-surface-muted",
              )}
            >
              {value}
            </Link>
          ),
        )}

        {page < totalPages ? (
          <Link
            href={buildHref(basePath, params, page + 1)}
            rel="next"
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-white px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-muted"
          >
            التالي
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const values: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) values.push("…");
  for (let i = start; i <= end; i += 1) values.push(i);
  if (end < totalPages - 1) values.push("…");
  values.push(totalPages);
  return values;
}
