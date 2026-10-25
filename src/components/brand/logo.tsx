import { cn } from "@/lib/utils";

/**
 * Original typographic identity for World Associates Shipping CO.
 * Monogram + wordmark, no external assets.
 */
export function Logo({
  variant = "dark",
  size = "md",
  className,
  showTagline = true,
}: {
  variant?: "dark" | "light" | "mono";
  size?: "sm" | "md" | "lg";
  className?: string;
  showTagline?: boolean;
}) {
  const markSizes = {
    sm: "size-8 rounded-lg text-[13px]",
    md: "size-10 rounded-xl text-[15px]",
    lg: "size-12 rounded-xl text-lg",
  } as const;

  const textSizes = {
    sm: "text-[13px]",
    md: "text-[15px]",
    lg: "text-[17px]",
  } as const;

  const markStyle =
    variant === "light"
      ? "bg-white text-navy"
      : variant === "mono"
        ? "bg-ink text-white"
        : "bg-navy text-white";

  const primaryText = variant === "light" ? "text-white" : "text-ink";
  const secondaryText = variant === "light" ? "text-white/70" : "text-muted";

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid shrink-0 place-items-center font-extrabold tracking-tight",
          markSizes[size],
          markStyle,
        )}
        aria-hidden
      >
        WA
        <span className="absolute -bottom-0.5 h-[3px] w-4 rounded-full bg-brand" />
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className={cn("font-extrabold tracking-tight", textSizes[size], primaryText)}>
          World Associates
        </span>
        {showTagline ? (
          <span
            className={cn(
              "mt-1 text-[9px] font-bold tracking-[0.28em] uppercase",
              variant === "light" ? "text-brand" : "text-brand-dark",
            )}
          >
            Shipping&nbsp;CO
          </span>
        ) : (
          <span className={cn("mt-1 text-[10px] font-semibold", secondaryText)}>Guangzhou · KSA</span>
        )}
      </span>
    </span>
  );
}
