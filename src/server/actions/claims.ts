"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { claimSchema, fieldErrors } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/audit";
import { requireCustomerAction } from "@/server/auth/guards";
import { isUniqueViolation } from "@/server/ids";
import { rateLimit } from "@/server/rate-limit";

function readForm(formData: FormData) {
  return {
    shipmentTrackingNumber: String(formData.get("shipmentTrackingNumber") ?? "").trim(),
    carrierTrackingNumber: String(formData.get("carrierTrackingNumber") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  };
}

/**
 * Submit a shipment claim (ربط طرد).
 *
 * Deliberately conservative and RLS-safe: knowing a tracking number NEVER
 * assigns a shipment. Every claim is queued as `pending` for staff review
 * (`approve_claim` links it). RLS also means the caller can only resolve a
 * tracking number that is already theirs — otherwise it is treated as an
 * unassigned claim. Every attempt is audited.
 */
export async function submitClaimAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomerAction();
  if (!session) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  const limit = rateLimit(`claim:${session.profileId}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return { ok: false, message: "عدد كبير من محاولات الربط. حاول مرة أخرى لاحقاً." };
  }

  const raw = readForm(formData);
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) {
    const echo: Record<string, string> = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value)]),
    );
    return {
      ok: false,
      message: "راجع الحقول المحددة.",
      errors: fieldErrors(parsed.error),
      data: echo,
    };
  }

  const { shipmentTrackingNumber, carrierTrackingNumber, description } = parsed.data;
  const supabase = await createClient();

  try {
    // Only a shipment already linked to this caller can be resolved (RLS).
    if (shipmentTrackingNumber) {
      const { data: mine } = await supabase
        .from("shipments")
        .select("id, tracking_number")
        .eq("tracking_number", shipmentTrackingNumber)
        .eq("customer_id", session.profileId)
        .maybeSingle();
      if (mine) {
        return {
          ok: false,
          message: `الشحنة ${mine.tracking_number} مرتبطة بحسابك بالفعل.`,
        };
      }
    }

    // carrier_tracking_number is NOT NULL; fall back to the shipment number.
    const carrierKey = carrierTrackingNumber || shipmentTrackingNumber;

    const { data, error } = await supabase
      .from("shipment_claim_requests")
      .insert({
        customer_id: session.profileId,
        shipment_id: null,
        shipment_tracking_number: shipmentTrackingNumber || null,
        carrier_tracking_number: carrierKey,
        description: description || null,
        request_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return {
          ok: false,
          message:
            "توجد طلبات ربط مفتوحة لهذه الشحنة بالفعل. يراجع فريقنا الطلبات واحداً تلو الآخر.",
        };
      }
      throw new Error(error.message);
    }

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "shipment.claim.submitted",
      entityType: "shipment_claim_request",
      entityId: data.id,
      metadata: { hasShipmentTracking: Boolean(shipmentTrackingNumber) },
    });

    revalidatePath("/link-shipment");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message:
        "استلمنا طلب الربط. سيتحقق فريقنا من ملكية الشحنة ويفتحها لحسابك خلال ساعات العمل، وستصلك إشعار عند اعتماد الطلب.",
      data: { status: "pending" },
    };
  } catch (error) {
    console.error("[claims] submit failed", error);
    return { ok: false, message: "تعذّر إرسال طلب الربط. حاول مرة أخرى." };
  }
}
