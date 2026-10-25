import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "استعادة كلمة المرور" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold text-ink">استعادة كلمة المرور</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          أدخل بيانات حسابك وسنُنشئ رابط إعادة تعيين صالح لمدة ساعة واحدة.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-7">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
