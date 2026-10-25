import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { connect, loadEnv } from "./lib-db.mjs";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

/**
 * Development / initialisation seed.
 *
 * Only REFERENCE data is created:
 *   - shipment status catalogue + allowed transitions
 *   - sequence counters (so customer / shipment numbers start deterministically)
 *   - configurable site content (company, contact, policies, FAQ, warehouse notes)
 *   - the first administrator account (from BOOTSTRAP_ADMIN_* variables)
 *
 * No customers, shipments, packages or statistics are fabricated.
 */

const STATUSES = [
  ["created", "تم إنشاء الشحنة", "warehouse", 10, false, false],
  ["awaiting_arrival", "في انتظار وصول الطرد", "warehouse", 20, false, false],
  ["received_warehouse", "تم استلام الطرد في مستودع قوانغتشو", "warehouse", 30, false, false],
  ["registered", "تم تسجيل الطرد", "warehouse", 40, false, false],
  ["ready_consolidation", "جاهزة للتجميع", "ready", 50, false, false],
  ["consolidating", "جاري التجميع", "ready", 60, false, false],
  ["ready_ship", "جاهزة للشحن", "ready", 70, false, false],
  ["awaiting_payment", "بانتظار الدفع", "awaiting_payment", 80, false, false],
  ["payment_confirmed", "تم تأكيد الدفع", "ready", 90, false, false],
  ["departed_cn", "تم شحنها من الصين", "in_transit", 100, false, false],
  ["arrived_sa", "وصلت إلى السعودية", "in_transit", 110, false, false],
  ["customs", "تحت إجراءات التخليص الجمركي", "in_transit", 120, false, false],
  ["handed_courier", "تم تسليمها لشركة التوصيل", "in_transit", 130, false, false],
  ["out_for_delivery", "خرجت للتوصيل", "in_transit", 140, false, false],
  ["delivered", "تم التسليم", "delivered", 150, false, false],
  ["on_hold", "معلقة", "exception", 200, true, true],
  ["delayed", "يوجد تأخير", "exception", 210, true, false],
  ["delivery_failed", "تعذر التسليم", "exception", 220, true, false],
  ["cancelled", "ملغاة", "cancelled", 230, true, true],
];

/** Canonical operational flow (administrators can extend it from the UI). */
const FLOW = [
  ["created", "awaiting_arrival"],
  ["awaiting_arrival", "received_warehouse"],
  ["received_warehouse", "registered"],
  ["registered", "ready_consolidation"],
  ["ready_consolidation", "consolidating"],
  ["consolidating", "ready_ship"],
  ["registered", "ready_ship"],
  ["ready_ship", "awaiting_payment"],
  ["registered", "awaiting_payment"],
  ["ready_consolidation", "awaiting_payment"],
  ["consolidating", "awaiting_payment"],
  ["awaiting_payment", "payment_confirmed"],
  ["payment_confirmed", "departed_cn"],
  ["departed_cn", "arrived_sa"],
  ["arrived_sa", "customs"],
  ["customs", "handed_courier"],
  ["handed_courier", "out_for_delivery"],
  ["out_for_delivery", "delivered"],
  ["handed_courier", "delivery_failed"],
  ["out_for_delivery", "delivery_failed"],
  ["delivery_failed", "out_for_delivery"],
];

const EXCEPTIONS = ["on_hold", "delayed", "delivery_failed", "cancelled"];
const ACTIVE_STATUSES = STATUSES.filter(
  ([code]) => code !== "delivered" && code !== "cancelled",
).map(([code]) => code);
const RESUMABLE = ["on_hold", "delayed", "delivery_failed"];

const SEQUENCES = [
  ["profiles", 100000],
  ["shipments", 0],
  ["packages", 0],
  ["consolidation", 0],
  ["tickets", 0],
];

const FAQ = [
  {
    q: "ما هو رقم العميل؟",
    a: "رقم العميل هو معرّفك الدائم لدى الشركة بصيغة WA-100001، يُنشأ تلقائياً عند التسجيل ولا يتغير، ويُستخدم للتعرّف عليك في مستودع قوانغتشو. وهو ليس رقم تتبع شحنة.",
  },
  {
    q: "ما الفرق بين رقم العميل ورقم تتبع الشحنة؟",
    a: "رقم العميل يعرّف الشخص، أما رقم تتبع الشحنة بصيغة WAS-2026-000001 فيعرّف كل شحنة على حدة ويظهر في صفحة التتبع.",
  },
  {
    q: "كيف أربط طرداً بحسابي؟",
    a: "من صفحة «ربط طرد» أدخل رقم التتبع. يتحقق النظام من وجود الشحنة ومن مطابقة بيانات المستلم، وإذا تعذّر التحقق يُرفع الطلب إلى فريق العمليات للمراجعة والاعتماد. لا يُربط أي طرد لمجرد معرفة رقمه.",
  },
  {
    q: "متى تظهر طرودي في المستودع؟",
    a: "تظهر بعد وصولها إلى مستودع قوانغتشو وتسجيلها من قبل فريق المستودع، وعندها تتحدّث حالاتها في النظام من قاعدة البيانات.",
  },
  {
    q: "كيف أدفع رسوم الشحن؟",
    a: "تُعرض حالة الدفع في صفحة الشحنة. بوابة الدفع الإلكتروني غير مفعّلة حالياً، ويمكن لفريق المالية تسجيل الدفعات المؤكدة يدوياً مع توثيق العملية. لا يتم تأكيد أي دفع من المتصفح.",
  },
  {
    q: "هل تاريخ التسليم مؤكد؟",
    a: "أي تاريخ يظهر في الشحنة مُعلَّم بأنه «تقديري» ما لم يكن هناك تحديث تشغيلي موثّق في سجل الشحنة.",
  },
  {
    q: "هل يمكنني تعديل عنوان شحنة قيد التنفيذ؟",
    a: "عنوان الشحنة يُثبَّت لحظة تأكيد التسليم، وأي تعديل عليه يتطلب اعتماداً من الإدارة حتى لا تتغير عناوين الشحنات المؤكدة تلقائياً.",
  },
  {
    q: "كيف أتواصل مع الدعم؟",
    a: "من صفحة «مركز المساعدة» يمكنك فتح تذكرة دعم ومتابعة رد الفريق داخل حسابك.",
  },
];

const PRIVACY_NOTICE = `تجمع World Associates Shipping CO أقل قدر ممكن من البيانات اللازمة لتقديم خدمة الشحن: الاسم الكامل، رقم الجوال، المدينة، عنوان التسليم، وبيانات الشحنات المرتبطة بحسابك.

لا يتم تخزين كلمات المرور بصيغتها الأصلية، ولا يتم تخزين أرقام البطاقات أو رموز التحقق (CVV) في أنظمة الشركة إطلاقاً.

تُستخدم بياناتك لعرض شحناتك، ولتعرّف مستودع قوانغتشو على الطرود الواردة باسمك، وللاتصال بك عند التسليم. لا يتم مشاركة عنوانك مع طرف ثالث باستثناء شركات التوصيل المسؤولة عن تسليم شحنتك.

يمكنك طلب نسخة من بياناتك أو حذف حسابك من خلال مركز المساعدة. تُحذف البيانات وفق جدول احتفاظ يحدده الإدارة ويتبع المتطلبات النظامية المعمول بها في المملكة العربية السعودية.

آخر تحديث: يُحرَّر هذا النص من لوحة الإدارة.`;

async function main() {
  loadEnv();
  const db = await connect();

  // --- sequence counters -------------------------------------------------
  for (const [key, value] of SEQUENCES) {
    await db.query(
      `INSERT INTO "sequences" (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, value],
    );
  }

  // --- status catalogue --------------------------------------------------
  for (const [code, label, group, sortOrder, isException, restricted] of STATUSES) {
    await db.query(
      `INSERT INTO "shipment_status_catalog"
         (code, label_ar, "group", sort_order, is_active, is_exception, restricted)
       VALUES ($1, $2, $3, $4, true, $5, $6)
       ON CONFLICT (code) DO UPDATE SET
         label_ar = EXCLUDED.label_ar,
         "group" = EXCLUDED."group",
         sort_order = EXCLUDED.sort_order,
         is_exception = EXCLUDED.is_exception,
         restricted = EXCLUDED.restricted`,
      [code, label, group, sortOrder, isException, restricted],
    );
  }

  // --- allowed transitions ----------------------------------------------
  const transitions = [...FLOW];
  for (const from of ACTIVE_STATUSES) {
    for (const to of EXCEPTIONS) {
      if (from !== to) transitions.push([from, to]);
    }
  }
  for (const from of RESUMABLE) {
    for (const to of ["ready_ship", "out_for_delivery", "awaiting_payment"]) {
      transitions.push([from, to]);
    }
  }
  const seen = new Set();
  for (const [from, to] of transitions) {
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await db.query(
      `INSERT INTO "shipment_status_transitions" (id, from_status, to_status, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (from_status, to_status) DO NOTHING`,
      [randomUUID(), from, to],
    );
  }

  // --- configurable site content ----------------------------------------
  const settings = {
    company: {
      name: "World Associates Shipping CO",
      nameAr: "World Associates Shipping CO",
      city: "Guangzhou",
      country: "China",
      currency: "SAR",
      timezone: "Asia/Riyadh",
    },
    contact: {
      phone: "",
      email: "",
      whatsapp: "",
      address: "",
      workingHours: "",
    },
    policies: {
      privacyNotice: PRIVACY_NOTICE,
      terms: "",
    },
    faq: FAQ,
    warehouse: {
      city: "Guangzhou",
      country: "China",
      address: "",
      recipientGuidance:
        "عند الشراء من المتاجر الصينية، استخدم رقم العميل (WA-XXXXXX) كاسم المستلم أو كمرجع داخل الطلب لتسهيل التعرّف على طردك في المستودع.",
      notes:
        "يُضاف عنوان المستودع الدقيق من لوحة الإدارة فقط. لا يتم عرض أي عنوان غير مُسجَّل رسمياً داخل النظام.",
    },
  };

  for (const [key, value] of Object.entries(settings)) {
    await db.query(
      `INSERT INTO "site_settings" (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)],
    );
  }

  // --- first administrator ----------------------------------------------
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  if (email && password) {
    const existing = await db.query(`SELECT id FROM "profiles" WHERE email = $1`, [email]);
    if (existing.rows.length === 0) {
      const id = randomUUID();
      await db.query(
        `INSERT INTO "profiles" (id, customer_number, full_name, phone, email, city, role, account_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'super_admin', 'active')`,
        [
          id,
          `WA-ADMIN-${id.slice(0, 6).toUpperCase()}`,
          process.env.BOOTSTRAP_ADMIN_NAME ?? "Super Admin",
          "+966500000000",
          email,
          "Guangzhou",
        ],
      );
      await db.query(
        `INSERT INTO "auth_credentials" (id, profile_id, password_hash) VALUES ($1, $2, $3)`,
        [randomUUID(), id, bcrypt.hashSync(password, 12)],
      );
      console.log(`[seed] created administrator ${email}`);
    } else {
      console.log("[seed] administrator already exists");
    }
  }

  await db.close();
  console.log("[seed] reference data ready");
}

main().catch((error) => {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
});
