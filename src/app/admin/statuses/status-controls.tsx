"use client";

import { useActionState } from "react";
import { Loader2, Power, Plus } from "lucide-react";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { INITIAL_STATE } from "@/lib/action-state";
import {
  addTransitionAction,
  setTransitionActiveAction,
  setStatusFlagAction,
} from "@/server/actions/statuses";

/** Toggle one edge of the transition matrix on or off. */
export function TransitionToggle({
  transitionId,
  fromLabel,
  toLabel,
  isActive,
}: {
  transitionId: string;
  fromLabel: string;
  toLabel: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(setTransitionActiveAction, INITIAL_STATE);

  return (
    <form action={formAction} className="flex items-center justify-between gap-3">
      <input type="hidden" name="transitionId" value={transitionId} />
      <input type="hidden" name="active" value={String(!isActive)} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-ink">
          {fromLabel} ← {toLabel}
        </p>
        <p className="text-xs text-muted">{isActive ? "مفعّل" : "موقوف"}</p>
      </div>
      <Button
        type="submit"
        size="sm"
        variant={isActive ? "outline" : "success"}
        disabled={pending}
        aria-label={isActive ? "إيقاف الانتقال" : "تفعيل الانتقال"}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Power className="size-4" aria-hidden />
        )}
        {isActive ? "إيقاف" : "تفعيل"}
      </Button>
      {state?.message ? (
        <span className="sr-only" role="status">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

/** Flip a catalogue flag: active / exception / restricted. */
export function StatusFlagToggle({
  code,
  labelAr,
  flag,
  flagLabel,
  value,
}: {
  code: string;
  labelAr: string;
  flag: "isActive" | "isException" | "restricted";
  flagLabel: string;
  value: boolean;
}) {
  const [state, formAction, pending] = useActionState(setStatusFlagAction, INITIAL_STATE);

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex items-center justify-between gap-3">
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="flag" value={flag} />
        <input type="hidden" name="active" value={String(!value)} />
        <span className="text-[13px] font-semibold text-ink">{flagLabel}</span>
        <Button
          type="submit"
          size="sm"
          variant={value ? "success" : "outline"}
          disabled={pending}
          aria-label={`${value ? "إيقاف" : "تفعيل"} ${flagLabel}`}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {value ? "مفعّل" : "موقوف"}
        </Button>
      </form>
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"} className="py-2 text-xs">
          {state.message}
        </Alert>
      ) : null}
      <span className="sr-only">{`${labelAr} — ${flagLabel}`}</span>
    </div>
  );
}

/** Add a new (from → to) edge to the transition matrix. */
export function AddTransitionForm({
  statusOptions,
}: {
  statusOptions: { code: string; labelAr: string }[];
}) {
  const [state, formAction, pending] = useActionState(addTransitionAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-3">
      {state?.message ? (
        <Alert variant={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field htmlFor="fromStatus" label="من حالة" required>
          <Select id="fromStatus" name="fromStatus" defaultValue="" disabled={pending} required>
            <option value="" disabled>
              اختر الحالة الحالية
            </option>
            {statusOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.labelAr}
              </option>
            ))}
          </Select>
        </Field>

        <Field htmlFor="toStatus" label="إلى حالة" required>
          <Select id="toStatus" name="toStatus" defaultValue="" disabled={pending} required>
            <option value="" disabled>
              اختر الحالة الجديدة
            </option>
            {statusOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.labelAr}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        إضافة انتقال
      </Button>
    </form>
  );
}
