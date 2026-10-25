import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "World Associates Shipping CO | شحن مشترياتك من الصين إلى السعودية",
    template: "%s | World Associates Shipping CO",
  },
  description:
    "بوابة عملاء World Associates Shipping CO: تابع طرودك وأدر شحناتك من مستودعنا في قوانغتشو حتى عنوانك في السعودية.",
  keywords: ["شحن", "الصين", "السعودية", "قوانغتشو", "تتبع شحنات", "شحن مشتريات"],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b1b33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className="h-full">
      <body className="min-h-full">
        {/* IBM Plex Sans Arabic is loaded at runtime with a safe system fallback,
            so the build never depends on an external font host. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          precedence="high"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
        {children}
      </body>
    </html>
  );
}
