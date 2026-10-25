"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Copies text with an explicit success feedback (clipboard API + fallback). */
export function CopyButton({
  value,
  label = "نسخ",
  className,
  variant = "ghost",
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: "ghost" | "outline" | "light";
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("input");
        input.value = value;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const styles =
    variant === "outline"
      ? "border border-line-strong bg-white text-ink hover:bg-surface-muted"
      : variant === "light"
        ? "border border-white/15 text-white/80 hover:bg-white/10 hover:text-white"
        : "text-muted hover:bg-surface-muted hover:text-ink";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "تم النسخ" : label}
      title={copied ? "تم النسخ" : label}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition-colors",
        styles,
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "تم النسخ" : label}
    </button>
  );
}
