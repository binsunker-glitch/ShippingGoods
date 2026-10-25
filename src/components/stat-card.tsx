import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const tones = {
  brand: "bg-brand-soft text-brand-dark",
  navy: "bg-navy/8 text-navy",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  violet: "bg-violet-soft text-violet",
} as const;

export type StatTone = keyof typeof tones;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{label}</p>
          <p className="tabular mt-2 text-3xl leading-none font-extrabold text-ink">{value}</p>
          {hint ? <p className="mt-2 text-xs leading-relaxed text-subtle">{hint}</p> : null}
        </div>
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl",
            tones[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
    </Card>
  );
}
