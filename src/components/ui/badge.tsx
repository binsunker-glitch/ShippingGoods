import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "neutral"
  | "navy"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-muted border-line",
  navy: "bg-navy text-white border-navy",
  brand: "bg-brand-soft text-brand-dark border-brand/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
  violet: "bg-violet-soft text-violet border-violet/30",
};

export function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0 rounded-full bg-current", className)}
      aria-hidden
    />
  );
}

export function BadgeWithDot({
  variant,
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge variant={variant} className={className}>
      <StatusDot />
      {children}
    </Badge>
  );
}
