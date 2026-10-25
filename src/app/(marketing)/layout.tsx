import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";

import { Logo } from "@/components/brand/logo";
import { APP_NAME_AR, WAREHOUSE_CITY } from "@/lib/constants";
import { getSiteSetting } from "@/server/queries/settings";
import { getSession } from "@/server/auth/session";

type ContactSettings = { phone?: string; email?: string; whatsapp?: string; hours?: string };

const PUBLIC_NAV = [
  { label: "الرئيسية", href: "/" },
  { label: "تتبع الشحنة", href: "/track" },
  { label: "كيف نعمل", href: "/#how-it-works" },
  { label: "خدماتنا", href: "/#services" },
  { label: "الأسئلة الشائعة", href: "/#faq" },
  { label: "تواصل معنا", href: "/#contact" },
];

/**
 * The session and the site settings are request-time reads, so they live in
 * async components behind <Suspense>: the header, nav and footer structure are
 * prerendered once, and only the personalised/dynamic pieces stream in.
 */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ---------------- header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label={`${APP_NAME_AR} — الصفحة الرئيسية`}>
            <Logo size="md" />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="التنقل الرئيسي">
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[13.5px] font-semibold text-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Suspense
            fallback={
              <div className="flex items-center gap-2">
                <span className="inline-flex h-10 items-center rounded-lg border border-line-strong bg-white px-4 text-[13.5px] font-bold text-ink">
                  تسجيل الدخول
                </span>
                <span className="hidden h-10 items-center rounded-lg bg-brand px-4 text-[13.5px] font-bold text-white sm:inline-flex">
                  إنشاء حساب
                </span>
              </div>
            }
          >
            <HeaderAuthActions />
          </Suspense>
        </div>

        {/* mobile nav */}
        <nav
          className="no-scrollbar flex gap-1 overflow-x-auto border-t border-line px-4 py-2 lg:hidden"
          aria-label="التنقل للجوال"
        >
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold text-muted hover:bg-surface-muted hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* ---------------- main ---------------- */}
      <main className="flex-1">{children}</main>

      {/* ---------------- footer ---------------- */}
      <footer className="border-t border-navy-line bg-navy text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4">
              <Logo variant="light" size="md" />
              <p className="max-w-xs text-[13px] leading-relaxed text-white/65">
                شحن مشترياتك من {WAREHOUSE_CITY} إلى عنوانك في المملكة العربية السعودية بخدمة
                موثوقة وتتبّع واضح.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">روابط سريعة</h3>
              <ul className="mt-3 space-y-2.5 text-[13px] text-white/65">
                {PUBLIC_NAV.slice(0, 4).map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="transition-colors hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">الحساب</h3>
              <ul className="mt-3 space-y-2.5 text-[13px] text-white/65">
                <li>
                  <Link href="/register" className="transition-colors hover:text-white">
                    إنشاء حساب
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="transition-colors hover:text-white">
                    تسجيل الدخول
                  </Link>
                </li>
                <li>
                  <Link href="/track" className="transition-colors hover:text-white">
                    تتبع الشحنة
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="transition-colors hover:text-white">
                    سياسة الخصوصية
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">تواصل معنا</h3>
              <ul className="mt-3 space-y-2.5 text-[13px] text-white/65">
                <Suspense
                  fallback={
                    <li className="skeleton-fill h-4 w-32 rounded bg-white/10" aria-hidden />
                  }
                >
                  <FooterContact />
                </Suspense>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center">
            <p>
              <Suspense fallback={<span>جميع الحقوق محفوظة.</span>}>
                <CopyrightLine />
              </Suspense>
            </p>
            <p>
              {WAREHOUSE_CITY} ← المملكة العربية السعودية
              <Suspense
                fallback={
                  <span className="skeleton-fill ms-2 inline-block h-3 w-40 rounded align-middle" aria-hidden />
                }
              >
                <PolicyStamp />
              </Suspense>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Personalised header buttons: depends on the session cookie. */
async function HeaderAuthActions() {
  const session = await getSession();
  const portalHref = session
    ? session.role === "customer"
      ? "/dashboard"
      : "/admin"
    : "/login";

  return (
    <div className="flex items-center gap-2">
      <Link
        href={session ? portalHref : "/login"}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-line-strong bg-white px-4 text-[13.5px] font-bold text-ink transition-colors hover:bg-surface-muted"
      >
        {session ? "لوحتي" : "تسجيل الدخول"}
      </Link>
      <Link
        href={session ? "/link-shipment" : "/register"}
        className="hidden h-10 items-center justify-center rounded-lg bg-brand px-4 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-dark sm:inline-flex"
      >
        {session ? "ربط طرد" : "إنشاء حساب"}
      </Link>
    </div>
  );
}

/** Contact block read from site settings (database). */
async function FooterContact() {
  // Opening the database calls Date.now() internally, which is unstable during
  // prerendering; connection() defers this read to request time.
  await connection();
  const contact = await getSiteSetting<ContactSettings>("contact");

  return (
    <>
      {contact?.phone ? (
        <li dir="ltr" className="text-end">
          {contact.phone}
        </li>
      ) : null}
      {contact?.email ? (
        <li dir="ltr" className="text-end">
          {contact.email}
        </li>
      ) : null}
      {contact?.whatsapp ? (
        <li dir="ltr" className="text-end">
          واتساب: {contact.whatsapp}
        </li>
      ) : null}
      {contact?.hours ? <li>{contact.hours}</li> : null}
      {!contact?.phone && !contact?.email && !contact?.whatsapp ? (
        <li className="text-white/50">ستُضبط بيانات التواصل من لوحة الإدارة.</li>
      ) : null}
    </>
  );
}

/**
 * `new Date()` is unstable during prerendering, so the year is read at request
 * time behind the same Suspense boundary as the rest of the footer's dynamic
 * pieces.
 */
async function CopyrightLine() {
  await connection();
  return (
    <>
      © {new Date().getFullYear()} {APP_NAME_AR}. جميع الحقوق محفوظة.
    </>
  );
}

/** Policy revision stamp read from site settings (database). */
async function PolicyStamp() {
  await connection();
  const policy = await getSiteSetting<{ updatedAt?: string }>("policy");
  if (!policy?.updatedAt) return null;
  return <> · آخر تحديث للسياسات: {policy.updatedAt}</>;
}
