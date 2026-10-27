"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { fieldErrors } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/audit";
import { requirePermissionAction } from "@/server/auth/guards";
import { nextPackageReference } from "@/server/ids";
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

  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("profiles")
    .select("id, full_name, account_status")
    .eq("id", raw.profileId)
    .maybeSingle();
  if (!customer) return { ok: false, message: "العميل غير موجود." };

  // Staff accounts are managed elsewhere — never suspended from this screen.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", customer.id);
  if ((roleRows ?? []).length > 0) {
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
    const { error } = await supabase
      .from("profiles")
      .update({ account_status: nextStatus })
      .eq("id", customer.id);
    if (error) throw new Error(error.message);

    // Suspension is enforced on every request: getSession() returns null for
    // any account whose status is not "active", so live sessions stop working
    // immediately without a server-side session table.

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: raw.action === "suspend" ? "customer.suspended" : "customer.activated",
      entityType: "profile",
      entityId: customer.id,
      metadata: { reason: raw.reason || undefined, previous: customer.account_status },
    });

    if (nextStatus === "active") {
      await createNotification({
        customerId: customer.id,
        title: "تم تفعيل حسابك",
        message: "تم إعادة تفعيل حسابك ويمكنك الآن تسجيل الدخول مجدداً.",
        type: "success",
      });
    }
  } catch (error) {
    console.error("[admin] set customer status failed", error);
    return { ok: false, message: "تعذّر تنفيذ الإجراء." };
  }

  revalidatePath("/admin/customers");
  return {
    ok: true,
    message:
      nextStatus === "suspended"
        ? `تم إيقاف حساب ${customer.full_name} وإلغاء جلساته.`
        : `تم تفعيل حساب ${customer.full_name}.`,
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
 * Move a shipment to a new status via the `transition_shipment` SECURITY
 * DEFINER RPC, which validates against the admin-configurable transition
 * matrix and writes one idempotent timeline event atomically.
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

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, tracking_number, current_status, customer_id")
    .eq("id", parsed.data.shipmentId)
    .maybeSingle();
  if (!shipment) return { ok: false, message: "الشحنة غير موجودة." };

  if (shipment.current_status === parsed.data.toStatus) {
    return { ok: false, message: "الشحنة على هذه الحالة بالفعل." };
  }

  const allowed = await canTransition(shipment.current_status, parsed.data.toStatus);
  if (!allowed) {
    const fromLabel =
      catalog.get(shipment.current_status)?.labelAr ?? shipment.current_status;
    return {
      ok: false,
      message: `لا يُسمح بالانتقال من «${fromLabel}» إلى «${target.labelAr}». عدّل مصفوفة الانتقالات من صفحة حالات الشحن.`,
    };
  }

  try {
    const { error } = await supabase.rpc("transition_shipment", {
      p_shipment_id: shipment.id,
      p_to_status: parsed.data.toStatus,
      p_location: parsed.data.location || null,
      p_description: parsed.data.description,
      p_expected_from: shipment.current_status,
    });
    if (error) throw new Error(error.message);

    // The RPC has no estimated-date parameter; set it directly (RLS allows
    // ops/warehouse to update shipments).
    if (parsed.data.estimatedDeliveryDate) {
      const { error: dateError } = await supabase
        .from("shipments")
        .update({
          estimated_delivery_date: parsed.data.estimatedDeliveryDate,
          estimated_delivery: true,
        })
        .eq("id", shipment.id);
      if (dateError) throw new Error(dateError.message);
    }

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "shipment.status_changed",
      entityType: "shipment",
      entityId: shipment.id,
      metadata: {
        from: shipment.current_status,
        to: parsed.data.toStatus,
        trackingNumber: shipment.tracking_number,
      },
    });

    if (shipment.customer_id) {
      await createNotification({
        customerId: shipment.customer_id,
        title: `تحديث حالة الشحنة ${shipment.tracking_number}`,
        message: parsed.data.description,
        type: target.isException ? "warning" : "info",
        link: `/shipments/${shipment.id}`,
      });
    }
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
  shipmentTrackingNumber: z.string().trim().max(40).optional(),
  reviewNote: z.string().trim().max(500).optional(),
});

/**
 * Approve or reject a shipment claim via the `approve_claim` / `reject_claim`
 * SECURITY DEFINER RPCs. Approval resolves the staff-entered tracking number
 * to a real shipment and links it to the claimant atomically.
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
    shipmentTrackingNumber: String(formData.get("shipmentTrackingNumber") ?? "").trim(),
    reviewNote: String(formData.get("reviewNote") ?? "").trim(),
  };

  const parsed = claimReviewSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "طلب مراجعة غير صالح.", errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data: claim } = await supabase
    .from("shipment_claim_requests")
    .select("id, customer_id, shipment_id, shipment_tracking_number, carrier_tracking_number, request_status")
    .eq("id", parsed.data.claimId)
    .maybeSingle();
  if (!claim) return { ok: false, message: "طلب الربط غير موجود." };
  if (claim.request_status !== "pending") {
    return { ok: false, message: "تمت مراجعة هذا الطلب بالفعل." };
  }

  const approve = parsed.data.decision === "approve";

  try {
    if (approve) {
      // Resolve the staff-entered (or claim-stored) tracking number to a
      // shipment; the RPC then links it to the claimant.
      const tracking =
        raw.shipmentTrackingNumber || claim.shipment_tracking_number || "";
      const { data: shipment } = tracking
        ? await supabase
            .from("shipments")
            .select("id, tracking_number")
            .eq("tracking_number", tracking)
            .maybeSingle()
        : { data: null };
      if (!shipment) {
        return {
          ok: false,
          message: tracking
            ? `لم يتم العثور على شحنة برقم ${tracking}. تأكّد من الرقم ثم أعد المحاولة.`
            : "لا يمكن اعتماد الطلب دون رقم شحنة صحيح.",
        };
      }

      const { error } = await supabase.rpc("approve_claim", {
        p_claim_id: claim.id,
        p_shipment_id: shipment.id,
        p_note: parsed.data.reviewNote || null,
      });
      if (error) throw new Error(error.message);

      await createNotification({
        customerId: claim.customer_id,
        title: "تم اعتماد طلب ربط الشحنة",
        message: `تم ربط الشحنة ${shipment.tracking_number} بحسابك بنجاح.`,
        type: "success",
        link: `/shipments/${shipment.id}`,
      });
    } else {
      const { error } = await supabase.rpc("reject_claim", {
        p_claim_id: claim.id,
        p_note: parsed.data.reviewNote || null,
      });
      if (error) throw new Error(error.message);

      await createNotification({
        customerId: claim.customer_id,
        title: "تم رفض طلب ربط الشحنة",
        message:
          parsed.data.reviewNote ||
          "لم نتمكن من التحقق من ملكية الشحنة. تواصل مع الدعم مع إرفاق إثبات الشراء.",
        type: "warning",
        link: "/help",
      });
    }

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: approve ? "shipment.claim.approved" : "shipment.claim.rejected",
      entityType: "shipment_claim_request",
      entityId: claim.id,
      metadata: { customerId: claim.customer_id },
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

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, customer_id")
    .eq("id", parsed.data.ticketId)
    .maybeSingle();
  if (!ticket) return { ok: false, message: "التذكرة غير موجودة." };

  try {
    const { error } = await supabase
      .from("support_tickets")
      .update({
        reply: parsed.data.reply,
        replied_at: new Date().toISOString(),
        status: "answered",
        assigned_to: session.profileId,
      })
      .eq("id", ticket.id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "support.ticket.replied",
      entityType: "support_ticket",
      entityId: ticket.id,
    });

    await createNotification({
      customerId: ticket.customer_id,
      title: "تم الرد على تذكرتك",
      message: parsed.data.reply.slice(0, 200),
      type: "info",
      link: "/help",
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

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("profiles")
    .select("id, full_name, account_status")
    .eq("customer_number", parsed.data.customerNumber.toUpperCase())
    .maybeSingle();
  if (!customer) {
    return {
      ok: false,
      message: "لا يوجد عميل بهذا الرقم.",
      errors: { customerNumber: "رقم العميل غير موجود" },
    };
  }
  if (customer.account_status !== "active") {
    return { ok: false, message: "حساب هذا العميل موقوف، لا يمكن تسجيل طرود عليه." };
  }

  try {
    const reference = await nextPackageReference();
    const { error } = await supabase.from("shipment_packages").insert({
      package_reference: reference,
      customer_id: customer.id,
      carrier_tracking_number: parsed.data.carrierTrackingNumber || null,
      description: parsed.data.description || null,
      weight: parsed.data.weight || null,
      dimensions: parsed.data.dimensions || null,
      package_status: "registered",
      notes: parsed.data.notes || null,
      received_by: session.profileId,
    });
    if (error) throw new Error(error.message);

    await logAudit({
      actorId: session.profileId,
      actorLabel: session.fullName,
      action: "package.registered",
      entityType: "package",
      metadata: { packageReference: reference, customerId: customer.id },
    });

    revalidatePath("/admin/warehouse");
    return { ok: true, message: `تم تسجيل الطرد ${reference} للعميل ${customer.full_name}.` };
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

  const supabase = await createClient();
  const { data: pkg } = await supabase
    .from("shipment_packages")
    .select("id, package_status, customer_id, package_reference")
    .eq("id", id)
    .maybeSingle();
  if (!pkg || pkg.package_status !== "registered") return;

  const { error } = await supabase
    .from("shipment_packages")
    .update({
      package_status: "received",
      warehouse_received_at: new Date().toISOString(),
      received_by: session.profileId,
    })
    .eq("id", pkg.id);
  if (error) {
    console.error("[admin] receive package failed", error);
    return;
  }

  await logAudit({
    actorId: session.profileId,
    actorLabel: session.fullName,
    action: "package.received",
    entityType: "package",
    entityId: pkg.id,
  });

  if (pkg.customer_id) {
    await createNotification({
      customerId: pkg.customer_id,
      title: "وصل طردك إلى المستودع",
      message: `تم استلام الطرد ${pkg.package_reference} في مستودع قوانغتشو.`,
      type: "success",
      link: "/packages",
    });
  }

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

  const supabase = await createClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("id, tracking_number, customer_id")
    .eq("id", parsed.data.shipmentId)
    .maybeSingle();
  if (!shipment) return { ok: false, message: "الشحنة غير موجودة." };

  try {
    // record_payment() records the row as "verified", recomputes the shipment
    // payment_status (paid / partially_paid / unpaid), and writes its own
    // audit entry — all inside one database transaction.
    const { error } = await supabase.rpc("record_payment", {
      p_shipment_id: shipment.id,
      p_amount: Number(parsed.data.amount),
      p_method: parsed.data.paymentMethod,
      p_reference: parsed.data.transactionReference || null,
      p_notes: parsed.data.notes || null,
    });
    if (error) throw new Error(error.message);

    if (shipment.customer_id) {
      await createNotification({
        customerId: shipment.customer_id,
        title: `تم تسجيل دفعة للشحنة ${shipment.tracking_number}`,
        message: `المبلغ ${parsed.data.amount} ر.س via ${parsed.data.paymentMethod}.`,
        type: "success",
        link: `/shipments/${shipment.id}`,
      });
    }
  } catch (error) {
    console.error("[admin] record payment failed", error);
    return { ok: false, message: "تعذّر تسجيل الدفعة." };
  }

  revalidatePath("/admin/payments");
  revalidatePath(`/admin/shipments/${shipment.id}`);
  return { ok: true, message: "تم تسجيل الدفعة بنجاح." };
}
