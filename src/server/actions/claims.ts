"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { withTransaction } from "@/db/client";
import { shipmentClaimRequests, shipments } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { claimSchema, fieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { requireCustomerAction } from "@/server/auth/guards";
import { isUniqueViolation } from "@/server/ids";
import { createNotification } from "@/server/notify";
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
 * Deliberately conservative: knowing a tracking number NEVER assigns a
 * shipment. The request is only auto-verified when the warehouse recipient
 * phone on the shipment matches the caller's own verified phone; everything
 * else is queued for staff review. Every attempt is audited.
 */
export async function submitClaimAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireCustomerAction();
  if (!session) return { ok: false, message: "انتهت الجلسة. سجّل الدخول مجدداً." };

  // Basic abuse guard: a handful of claims per hour per account.
  const limit = rateLimit(`claim:${session.profileId}`, 10, 60 * 60 * 1000);
  if (!limit.ok) {
    return {
      ok: false,
      message: "عدد كبير من محاولات الربط. حاول مرة أخرى لاحقاً.",
    };
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

  try {
    const result = await withTransaction(async (tx) => {
      // ---- resolve the shipment, if the customer gave OUR tracking number ----
      const shipmentRows = shipmentTrackingNumber
        ? await tx
            .select({
              id: shipments.id,
              trackingNumber: shipments.trackingNumber,
              customerId: shipments.customerId,
              recipientPhone: shipments.recipientPhone,
            })
            .from(shipments)
            .where(eq(shipments.trackingNumber, shipmentTrackingNumber))
            .limit(1)
        : [];

      const shipment = shipmentRows[0] ?? null;

      // Already linked to this customer: nothing to do, no new claim row.
      if (shipment?.customerId === session.profileId) {
        return {
          kind: "already_linked" as const,
          message: `الشحنة ${shipment.trackingNumber} مرتبطة بحسابك بالفعل.`,
        };
      }

      // Linked to someone else: refuse without revealing who owns it.
      if (shipment && shipment.customerId && shipment.customerId !== session.profileId) {
        await logAudit(
          {
            actorId: session.profileId,
            actorLabel: session.fullName,
            action: "shipment.claim.rejected_owner_mismatch",
            entityType: "shipment",
            entityId: shipment.id,
            metadata: { trackingNumber: shipment.trackingNumber },
          },
          tx,
        );
        return {
          kind: "rejected" as const,
          message:
            "هذه الشحنة مرتبطة بحساب آخر. إذا كنت تعتقد أن هناك خطأً، تواصل مع الدعم مع إرفاق إثبات الشراء.",
        };
      }

      // ---- decide verification level ----
      // Auto-verify ONLY on an exact recipient-phone match with the account's
      // own phone. A bare tracking number is never sufficient. Both sides are
      // normalized so "+9665xxxxxxxx" == "05xxxxxxxx" is handled correctly.
      const normalize = (value: string | null | undefined): string => {
        if (!value) return "";
        const digits = value.replace(/[^\d]/g, "");
        if (digits.startsWith("966")) return `+${digits}`;
        if (digits.startsWith("05")) return `+966${digits.slice(2)}`;
        if (digits.startsWith("5") && digits.length === 9) return `+966${digits}`;
        return `+${digits}`;
      };
      const phoneMatches =
        shipment?.recipientPhone != null &&
        session.phone.length > 0 &&
        normalize(shipment.recipientPhone) === normalize(session.phone);

      const requestStatus = phoneMatches ? "auto_verified" : "pending";
      const shipmentId = phoneMatches && shipment ? shipment.id : shipment?.id ?? null;

      // A shipment can hold at most one open claim (DB unique index backstops
      // races); catch the violation and report it cleanly.
      const claimId = randomUUID();
      try {
        await tx.insert(shipmentClaimRequests).values({
          id: claimId,
          customerId: session.profileId,
          shipmentId,
          shipmentTrackingNumber: shipmentTrackingNumber || null,
          carrierTrackingNumber: carrierTrackingNumber || null,
          description: description || null,
          requestStatus,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return {
            kind: "duplicate" as const,
            message:
              "توجد طلبات ربط مفتوحة لهذه الشحنة بالفعل. يراجع فريقنا الطلبات واحداً تلو الآخر.",
          };
        }
        throw error;
      }

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "shipment.claim.submitted",
          entityType: "shipment_claim_request",
          entityId: claimId,
          metadata: {
            requestStatus,
            phoneMatched: phoneMatches,
            hasShipmentId: Boolean(shipmentId),
          },
        },
        tx,
      );

      if (phoneMatches && shipment) {
        // Verified: link the shipment to this customer inside the same tx.
        await tx
          .update(shipments)
          .set({ customerId: session.profileId, updatedAt: new Date() })
          .where(eq(shipments.id, shipment.id));

        await createNotification(
          {
            customerId: session.profileId,
            title: "تم ربط الشحنة بحسابك",
            message: `تم التحقق من الشحنة ${shipment.trackingNumber} وربطها بحسابك بنجاح.`,
            type: "success",
            link: `/shipments/${shipment.id}`,
          },
          tx,
        );

        return {
          kind: "verified" as const,
          message: `تم التحقق من الشحنة ${shipment.trackingNumber} وربطها بحسابك.`,
        };
      }

      return {
        kind: "pending" as const,
        message:
          "استلمنا طلب الربط. سيتحقق فريقنا من ملكية الشحنة ويفتحها لحسابك خلال ساعات العمل، وستصلك إشعار عند اعتماد الطلب.",
      };
    });

    revalidatePath("/link-shipment");
    revalidatePath("/dashboard");

    if (result.kind === "rejected" || result.kind === "duplicate") {
      return { ok: false, message: result.message };
    }
    return {
      ok: true,
      message: result.message,
      data: result.kind === "verified" ? { status: "verified" } : { status: "pending" },
    };
  } catch (error) {
    console.error("[claims] submit failed", error);
    return { ok: false, message: "تعذّر إرسال طلب الربط. حاول مرة أخرى." };
  }
}
