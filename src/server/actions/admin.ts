"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDb, withTransaction } from "@/db/client";
import {
  packages,
  profiles,
  shipmentClaimRequests,
  shipmentEvents,
  shipmentPayments,
  shipments,
  supportTickets,
} from "@/db/schema";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors } from "@/lib/validation";
import { z } from "zod";
import { logAudit } from "@/server/audit";
import { requirePermissionAction } from "@/server/auth/guards";
import { createNotification } from "@/server/notify";
import { canTransition, getStatusCatalog } from "@/server/queries/statuses";

/* ------------------------------------------------------------------ */
/* Customer management                                                 */
/* ------------------------------------------------------------------ */

const suspendSchema = z.object({
  profileId: z.string().min(1),
  reason: z.string().trim().min(3, "اذكر سبب الإيقاف").max(500),
});

/** Suspend / reinstate a customer account (super admin + operations only). */
export async function setCustomerStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("customers.suspend");
  if (!session) return { ok: false, message: "لا تملك صلاحية تنفيذ هذا الإجراء." };

  const raw = {
    profileId: String(formData.get("profileId") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    action: String(formData.get("action") ?? ""),
  };

  if (!["suspend", "activate"].includes(raw.action)) {
    return { ok: false, message: "إجراء غير معروف." };
  }

  const db = await getDb();
  const target = await db
    .select({ id: profiles.id, fullName: profiles.fullName, role: profiles.role, accountStatus: profiles.accountStatus })
    .from(profiles)
    .where(eq(profiles.id, raw.profileId))
    .limit(1);
  const customer = target[0];
  if (!customer) return { ok: false, message: "العميل غير موجود." };
  if (customer.role !== "customer") {
    return { ok: false, message: "لا يمكن إيقاف حساب موظف من هذه الشاشة." };
  }
  if (customer.id === session.profileId) {
    return { ok: false, message: "لا يمكنك إيقاف حسابك أنت." };
  }

  if (raw.action === "suspend") {
    const parsed = suspendSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, message: "راجع الحقول.", errors: fieldErrors(parsed.error) };
    }
  }

  const nextStatus = raw.action === "suspend" ? "suspended" : "active";
  try {
    await withTransaction(async (tx) => {
      await tx
        .update(profiles)
        .set({ accountStatus: nextStatus, updatedAt: new Date() })
        .where(eq(profiles.id, customer.id));

      // Suspending drops every active session immediately.
      if (nextStatus === "suspended") {
        const { sessions } = await import("@/db/schema");
        await tx
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.profileId, customer.id)));
      }

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: raw.action === "suspend" ? "customer.suspended" : "customer.activated",
          entityType: "profile",
          entityId: customer.id,
          metadata: { reason: raw.reason || undefined, previous: customer.accountStatus },
        },
        tx,
      );

      if (nextStatus === "active") {
        await createNotification(
          {
            customerId: customer.id,
            title: "تم تفعيل حسابك",
            message: "تم إعادة تفعيل حسابك ويمكنك الآن تسجيل الدخول مجدداً.",
            type: "success",
          },
          tx,
        );
      }
    });
  } catch (error) {
    console.error("[admin] set customer status failed", error);
    return { ok: false, message: "تعذّر تنفيذ الإجراء." };
  }

  revalidatePath("/admin/customers");
  return {
    ok: true,
    message:
      nextStatus === "suspended"
        ? `تم إيقاف حساب ${customer.fullName} وإلغاء جلساته.`
        : `تم تفعيل حساب ${customer.fullName}.`,
  };
}

/* ------------------------------------------------------------------ */
/* Shipment status changes                                             */
/* ------------------------------------------------------------------ */

const statusSchema = z.object({
  shipmentId: z.string().min(1),
  toStatus: z.string().min(1),
  location: z.string().trim().max(160).optional(),
  description: z.string().trim().min(3, "اكتب وصفاً للحدث").max(400),
  estimatedDeliveryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ بصيغة YYYY-MM-DD")
    .or(z.literal(""))
    .optional(),
});

/**
 * Move a shipment to a new status, guarded by the admin-configurable
 * transition matrix and the restricted-status rule. Writes an idempotent
 * event so a retry can never duplicate the timeline entry.
 */
export async function changeShipmentStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("shipments.status");
  if (!session) return { ok: false, message: "لا تملك صلاحية تغيير حالة الشحنات." };

  const raw = {
    shipmentId: String(formData.get("shipmentId") ?? ""),
    toStatus: String(formData.get("toStatus") ?? ""),
    location: String(formData.get("location") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    estimatedDeliveryDate: String(formData.get("estimatedDeliveryDate") ?? "").trim(),
  };

  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "راجع الحقول.", errors: fieldErrors(parsed.error) };
  }

  const catalog = await getStatusCatalog();
  const target = catalog.get(parsed.data.toStatus);
  if (!target) {
    return { ok: false, message: "الحالة المطلوبة غير موجودة في الكتالوج." };
  }

  // Only super admins may apply statuses flagged as restricted.
  if (target.restricted && session.role !== "super_admin") {
    return { ok: false, message: "هذه الحالة مقصورة على المدير العام." };
  }

  const db = await getDb();
  const rows = await db
    .select({
      id: shipments.id,
      trackingNumber: shipments.trackingNumber,
      currentStatus: shipments.currentStatus,
      customerId: shipments.customerId,
    })
    .from(shipments)
    .where(eq(shipments.id, parsed.data.shipmentId))
    .limit(1);
  const shipment = rows[0];
  if (!shipment) return { ok: false, message: "الشحنة غير موجودة." };

  if (shipment.currentStatus === parsed.data.toStatus) {
    return { ok: false, message: "الشحنة على هذه الحالة بالفعل." };
  }

  const allowed = await canTransition(shipment.currentStatus, parsed.data.toStatus);
  if (!allowed) {
    const fromLabel = catalog.get(shipment.currentStatus)?.labelAr ?? shipment.currentStatus;
    return {
      ok: false,
      message: `لا يُسمح بالانتقال من «${fromLabel}» إلى «${target.labelAr}». عدّل مصفوفة الانتقالات من صفحة حالات الشحن.`,
    };
  }

  try {
    await withTransaction(async (tx) => {
      const now = new Date();
      await tx
        .update(shipments)
        .set({
          currentStatus: parsed.data.toStatus,
          statusGroup: target.group,
          updatedAt: now,
          ...(parsed.data.estimatedDeliveryDate
            ? { estimatedDeliveryDate: parsed.data.estimatedDeliveryDate, estimatedDelivery: true }
            : {}),
        })
        .where(eq(shipments.id, shipment.id));

      // Idempotency key: same shipment + status + timestamp bucket => one row.
      const bucket = Math.floor(now.getTime() / 1000);
      await tx
        .insert(shipmentEvents)
        .values({
          id: randomUUID(),
          shipmentId: shipment.id,
          status: parsed.data.toStatus,
          statusGroup: target.group,
          location: parsed.data.location || null,
          description: parsed.data.description,
          eventTimestamp: now,
          source: "staff",
          createdBy: session.profileId,
          idempotencyKey: `${shipment.id}:${parsed.data.toStatus}:${bucket}`,
        })
        .onConflictDoNothing({ target: shipmentEvents.idempotencyKey });

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "shipment.status_changed",
          entityType: "shipment",
          entityId: shipment.id,
          metadata: {
            from: shipment.currentStatus,
            to: parsed.data.toStatus,
            trackingNumber: shipment.trackingNumber,
          },
        },
        tx,
      );

      if (shipment.customerId) {
        await createNotification(
          {
            customerId: shipment.customerId,
            title: `تحديث حالة الشحنة ${shipment.trackingNumber}`,
            message: parsed.data.description,
            type: target.isException ? "warning" : "info",
            link: `/shipments/${shipment.id}`,
          },
          tx,
        );
      }
    });
  } catch (error) {
    console.error("[admin] status change failed", error);
    return { ok: false, message: "تعذّر تغيير الحالة." };
  }

  revalidatePath("/admin/shipments");
  revalidatePath(`/admin/shipments/${shipment.id}`);
  return { ok: true, message: `تم تحديث الحالة إلى «${target.labelAr}».` };
}

/* ------------------------------------------------------------------ */
/* Claims review                                                       */
/* ------------------------------------------------------------------ */

const claimReviewSchema = z.object({
  claimId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().max(500).optional(),
});

/**
 * Approve or reject a shipment claim. Approval re-checks that no other open
 * claim holds the shipment (the unique index is the final guard) and links it
 * to the claimant inside one transaction.
 */
export async function reviewClaimAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("claims.review");
  if (!session) return { ok: false, message: "لا تملك صلاحية مراجعة طلبات الربط." };

  const raw = {
    claimId: String(formData.get("claimId") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    reviewNote: String(formData.get("reviewNote") ?? "").trim(),
  };

  const parsed = claimReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "طلب مراجعة غير صالح.", errors: fieldErrors(parsed.error) };
  }

  const db = await getDb();
  const rows = await db
    .select()
    .from(shipmentClaimRequests)
    .where(eq(shipmentClaimRequests.id, parsed.data.claimId))
    .limit(1);
  const claim = rows[0];
  if (!claim) return { ok: false, message: "طلب الربط غير موجود." };
  if (!["pending", "auto_verified"].includes(claim.requestStatus)) {
    return { ok: false, message: "تمت مراجعة هذا الطلب بالفعل." };
  }

  const approve = parsed.data.decision === "approve";

  try {
    await withTransaction(async (tx) => {
      await tx
        .update(shipmentClaimRequests)
        .set({
          requestStatus: approve ? "approved" : "rejected",
          reviewNote: parsed.data.reviewNote || null,
          reviewedAt: new Date(),
          reviewedBy: session.profileId,
        })
        .where(eq(shipmentClaimRequests.id, claim.id));

      if (approve && claim.shipmentId) {
        await tx
          .update(shipments)
          .set({ customerId: claim.customerId, updatedAt: new Date() })
          .where(eq(shipments.id, claim.shipmentId));
      }

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: approve ? "shipment.claim.approved" : "shipment.claim.rejected",
          entityType: "shipment_claim_request",
          entityId: claim.id,
          metadata: { shipmentId: claim.shipmentId, customerId: claim.customerId },
        },
        tx,
      );

      await createNotification(
        {
          customerId: claim.customerId,
          title: approve ? "تم اعتماد طلب ربط الشحنة" : "تم رفض طلب ربط الشحنة",
          message: approve
            ? `تم ربط الشحنة ${claim.shipmentTrackingNumber ?? ""} بحسابك بنجاح.`
            : (parsed.data.reviewNote ??
              "لم نتمكن من التحقق من ملكية الشحنة. تواصل مع الدعم مع إرفاق إثبات الشراء."),
          type: approve ? "success" : "warning",
          link: approve && claim.shipmentId ? `/shipments/${claim.shipmentId}` : "/help",
        },
        tx,
      );
    });
  } catch (error) {
    console.error("[admin] claim review failed", error);
    return { ok: false, message: "تعذّر تنفيذ المراجعة." };
  }

  revalidatePath("/admin/claims");
  return {
    ok: true,
    message: approve ? "تم اعتماد الربط وفتح الشحنة للعميل." : "تم رفض طلب الربط.",
  };
}

/* ------------------------------------------------------------------ */
/* Support reply                                                       */
/* ------------------------------------------------------------------ */

const replySchema = z.object({
  ticketId: z.string().min(1),
  reply: z.string().trim().min(3, "اكتب نص الرد").max(4000),
});

export async function replyTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("support.reply");
  if (!session) return { ok: false, message: "لا تملك صلاحية الرد على التذاكر." };

  const raw = {
    ticketId: String(formData.get("ticketId") ?? ""),
    reply: String(formData.get("reply") ?? ""),
  };
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "راجع الحقول.", errors: fieldErrors(parsed.error) };
  }

  const db = await getDb();
  const rows = await db
    .select({ id: supportTickets.id, customerId: supportTickets.customerId })
    .from(supportTickets)
    .where(eq(supportTickets.id, parsed.data.ticketId))
    .limit(1);

  const ticket = rows[0];
  if (!ticket) return { ok: false, message: "التذكرة غير موجودة." };

  try {
    await withTransaction(async (tx) => {
      await tx
        .update(supportTickets)
        .set({
          reply: parsed.data.reply,
          repliedAt: new Date(),
          status: "answered",
          updatedAt: new Date(),
          assignedTo: session.profileId,
        })
        .where(eq(supportTickets.id, ticket.id));

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "support.ticket.replied",
          entityType: "support_ticket",
          entityId: ticket.id,
        },
        tx,
      );

      await createNotification(
        {
          customerId: ticket.customerId,
          title: "تم الرد على تذكرتك",
          message: parsed.data.reply.slice(0, 200),
          type: "info",
          link: "/help",
        },
        tx,
      );
    });
  } catch (error) {
    console.error("[admin] ticket reply failed", error);
    return { ok: false, message: "تعذّر إرسال الرد." };
  }

  revalidatePath("/admin/support");
  return { ok: true, message: "تم إرسال الرد وتحديث التذكرة." };
}

/* ------------------------------------------------------------------ */
/* Warehouse: register + receive a package                             */
/* ------------------------------------------------------------------ */

const packageSchema = z.object({
  customerNumber: z.string().trim().min(3, "أدخل رقم العميل"),
  carrierTrackingNumber: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  weight: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,3})?$/, "الوزن رقم صحيح أو عشري")
    .or(z.literal("")),
  dimensions: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function registerPackageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("warehouse.write");
  if (!session) return { ok: false, message: "لا تملك صلاحية تسجيل الطرود." };

  const raw = {
    customerNumber: String(formData.get("customerNumber") ?? ""),
    carrierTrackingNumber: String(formData.get("carrierTrackingNumber") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    weight: String(formData.get("weight") ?? "").trim(),
    dimensions: String(formData.get("dimensions") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  const parsed = packageSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "راجع الحقول.", errors: fieldErrors(parsed.error) };
  }

  const db = await getDb();
  const customerRows = await db
    .select({ id: profiles.id, fullName: profiles.fullName, accountStatus: profiles.accountStatus })
    .from(profiles)
    .where(eq(profiles.customerNumber, parsed.data.customerNumber.toUpperCase()))
    .limit(1);
  const customer = customerRows[0];
  if (!customer) {
    return { ok: false, message: "لا يوجد عميل بهذا الرقم.", errors: { customerNumber: "رقم العميل غير موجود" } };
  }
  if (customer.accountStatus !== "active") {
    return { ok: false, message: "حساب هذا العميل موقوف، لا يمكن تسجيل طرود عليه." };
  }

  try {
    const reference = await withTransaction(async (tx) => {
      const { nextPackageReference } = await import("@/server/ids");
      const ref = await nextPackageReference(tx);
      const id = randomUUID();
      await tx.insert(packages).values({
        id,
        packageReference: ref,
        customerId: customer.id,
        carrierTrackingNumber: parsed.data.carrierTrackingNumber || null,
        description: parsed.data.description || null,
        weight: parsed.data.weight || null,
        dimensions: parsed.data.dimensions || null,
        packageStatus: "registered",
        notes: parsed.data.notes || null,
        receivedBy: session.profileId,
      });
      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "package.registered",
          entityType: "package",
          entityId: id,
          metadata: { packageReference: ref, customerId: customer.id },
        },
        tx,
      );
      return ref;
    });

    revalidatePath("/admin/warehouse");
    return { ok: true, message: `تم تسجيل الطرد ${reference} للعميل ${customer.fullName}.` };
  } catch (error) {
    console.error("[admin] register package failed", error);
    return { ok: false, message: "تعذّر تسجيل الطرد." };
  }
}

/** Mark a registered package as physically received in the warehouse. */
export async function receivePackageAction(formData: FormData): Promise<void> {
  const session = await requirePermissionAction("warehouse.write");
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = await getDb();
  const rows = await db
    .select({ id: packages.id, packageStatus: packages.packageStatus, customerId: packages.customerId, packageReference: packages.packageReference })
    .from(packages)
    .where(eq(packages.id, id))
    .limit(1);
  const pkg = rows[0];
  if (!pkg || pkg.packageStatus !== "registered") return;

  await withTransaction(async (tx) => {
    await tx
      .update(packages)
      .set({ packageStatus: "received", warehouseReceivedAt: new Date(), updatedAt: new Date(), receivedBy: session.profileId })
      .where(eq(packages.id, pkg.id));

    await logAudit(
      {
        actorId: session.profileId,
        actorLabel: session.fullName,
        action: "package.received",
        entityType: "package",
        entityId: pkg.id,
      },
      tx,
    );

    if (pkg.customerId) {
      await createNotification(
        {
          customerId: pkg.customerId,
          title: "وصل طردك إلى المستودع",
          message: `تم استلام الطرد ${pkg.packageReference} في مستودع قوانغتشو.`,
          type: "success",
          link: "/packages",
        },
        tx,
      );
    }
  });

  revalidatePath("/admin/warehouse");
}

/* ------------------------------------------------------------------ */
/* Payments: record an offline payment (finance role)                  */
/* ------------------------------------------------------------------ */

const paymentSchema = z.object({
  shipmentId: z.string().min(1),
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "المبلغ رقم صحيح أو عشري"),
  paymentMethod: z.string().trim().min(2, "حدد طريقة الدفع").max(60),
  transactionReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermissionAction("payments.write");
  if (!session) return { ok: false, message: "لا تملك صلاحية تسجيل المدفوعات." };

  const raw = {
    shipmentId: String(formData.get("shipmentId") ?? ""),
    amount: String(formData.get("amount") ?? ""),
    paymentMethod: String(formData.get("paymentMethod") ?? ""),
    transactionReference: String(formData.get("transactionReference") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "راجع الحقول.", errors: fieldErrors(parsed.error) };
  }

  const db = await getDb();
  const rows = await db
    .select({ id: shipments.id, trackingNumber: shipments.trackingNumber, customerId: shipments.customerId, shippingFee: shipments.shippingFee })
    .from(shipments)
    .where(eq(shipments.id, parsed.data.shipmentId))
    .limit(1);
  const shipment = rows[0];
  if (!shipment) return { ok: false, message: "الشحنة غير موجودة." };

  try {
    await withTransaction(async (tx) => {
      await tx.insert(shipmentPayments).values({
        id: randomUUID(),
        shipmentId: shipment.id,
        amount: parsed.data.amount,
        currency: "SAR",
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: "completed",
        transactionReference: parsed.data.transactionReference || null,
        notes: parsed.data.notes || null,
        recordedBy: session.profileId,
      });

      // Flip the shipment to paid only when recorded fees are fully covered.
      if (shipment.shippingFee) {
        const paidRows = await tx
          .select({ total: shipmentPayments.amount })
          .from(shipmentPayments)
          .where(eq(shipmentPayments.shipmentId, shipment.id));
        const paid = paidRows.reduce((sum, row) => sum + Number(row.total), 0);
        if (paid >= Number(shipment.shippingFee)) {
          await tx
            .update(shipments)
            .set({ paymentStatus: "paid", updatedAt: new Date() })
            .where(eq(shipments.id, shipment.id));
        }
      }

      await logAudit(
        {
          actorId: session.profileId,
          actorLabel: session.fullName,
          action: "payment.recorded",
          entityType: "shipment",
          entityId: shipment.id,
          metadata: { amount: parsed.data.amount, method: parsed.data.paymentMethod },
        },
        tx,
      );

      if (shipment.customerId) {
        await createNotification(
          {
            customerId: shipment.customerId,
            title: `تم تسجيل دفعة للشحنة ${shipment.trackingNumber}`,
            message: `المبلغ ${parsed.data.amount} ر.س via ${parsed.data.paymentMethod}.`,
            type: "success",
            link: `/shipments/${shipment.id}`,
          },
          tx,
        );
      }
    });
  } catch (error) {
    console.error("[admin] record payment failed", error);
    return { ok: false, message: "تعذّر تسجيل الدفعة." };
  }

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/shipments/${shipment.id}`);
  return { ok: true, message: "تم تسجيل الدفعة بنجاح." };
}
