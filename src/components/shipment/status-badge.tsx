import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { STATUS_GROUP_VARIANTS } from "@/lib/constants";
import type { StatusGroup } from "@/db/schema";
import { getStatusCatalog } from "@/server/queries/statuses";

/**
 * Renders the current shipment status using the database catalogue.
 * Never invents a label: unknown codes fall back to the raw code.
 */
export async function StatusBadge({
  status,
  group,
  className,
}: {
  status: string;
  group: StatusGroup | string;
  className?: string;
}) {
  const catalog = await getStatusCatalog();
  const entry = catalog.get(status);
  const label = entry?.labelAr ?? status;
  const variant: BadgeVariant =
    STATUS_GROUP_VARIANTS[(group as StatusGroup) ?? entry?.group ?? "warehouse"] ?? "neutral";

  return (
    <Badge variant={variant} className={className}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </Badge>
  );
}
