"use client";

import { useActionState, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import { STATUS_GROUP_LABELS, STATUS_GROUP_VARIANTS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { trackShipmentAction, type PublicTrackingResult } from "@/server/actions/tracking";

/**
 * Public tracking form. Renders whatever the server actually found — an
 * unknown tracking number produces a clear "not found" message, never a
 * fabricated timeline.
 */
export function TrackForm() {
  const [state, formAction, pending] = useActionState(trackShipmentAction, INITIAL_STATE);
  const [trackingInput, setTrackingInput] = useState("");

  const result = parseResult(state?.data?.result);

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-col gap-2.5 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Input
            name="trackingNumber"
            dir="ltr"
            placeholder="WAS-2026-000123"
            value={trackingInput}
            onChange={(event) => setTrackingInput(event.target.value)}
            className="ps-9"
            aria-label="رقم التتبع"
            disabled={pending}
            required
          />
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "جارٍ البحث..." : "تتبع"}
        </button>
      </form>

      {state?.message && !result ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {result ? <TrackingResult result={result} /> : null}
    </div>
  );
}

function TrackingResult({ result }: { result: PublicTrackingResult }) {
  return (
    <div className="space-y-4 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">رقم التتبع</p>
          <p className="tabular text-sm font-extrabold text-ink">{result.trackingNumber}</p>
        </div>
        <Badge variant={STATUS_GROUP_VARIANTS[result.statusGroup] ?? "neutral"}>
          {STATUS_GROUP_LABELS[result.statusGroup] ?? result.currentStatusLabel}
        </Badge>
      </div>

      {result.destinationCity ? (
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <MapPin className="size-3.5" aria-hidden />
          الوجهة: {result.destinationCity}
        </p>
      ) : null}

      {result.estimatedDeliveryDate ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-[13px] leading-relaxed text-muted">
          <span className="font-bold text-ink">موعد التسليم المتوقع:</span>{" "}
          <span className="tabular">{formatDate(result.estimatedDeliveryDate)}</span>
          {result.estimatedDelivery ? (
            <span className="mt-1 block text-xs text-subtle">
              موعد تقديري وقد يتغيّر حسب حالة الشحن والتخليص الفعلية.
            </span>
          ) : null}
        </p>
      ) : null}

      {result.events.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          لا توجد تحديثات مسجّلة على هذه الشحنة بعد.
        </p>
      ) : (
        <ol className="relative space-y-0">
          {[...result.events].reverse().map((event, index, list) => {
            const isLast = index === list.length - 1;
            return (
              <li key={`${event.status}-${event.eventTimestamp}`} className="relative ps-7 pb-6 last:pb-0">
                {!isLast ? (
                  <span className="absolute end-[6px] top-4 bottom-0 w-0.5 bg-line" aria-hidden />
                ) : null}
                <span
                  className={[
                    "absolute end-0 top-1 size-3 rounded-full ring-2 ring-white",
                    event.isException
                      ? "bg-danger"
                      : event.group === "delivered"
                        ? "bg-success"
                        : "bg-brand",
                  ].join(" ")}
                  aria-hidden
                />
                <p className="text-[13px] font-bold text-ink">{event.statusLabelAr}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{event.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                  <time dateTime={event.eventTimestamp}>
                    {formatDateTime(event.eventTimestamp)}
                  </time>
                  {event.location ? <span>{event.location}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function parseResult(raw: string | undefined): PublicTrackingResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicTrackingResult;
  } catch {
    return null;
  }
}
