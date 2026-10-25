/**
 * Formatting helpers. All timestamps are stored in UTC and rendered in
 * Asia/Riyadh with Latin digits so numbers stay readable in an RTL layout.
 */

const TIME_ZONE = process.env.APP_TIMEZONE ?? "Asia/Riyadh";
const AR = "ar-u-nu-latn-ca-gregory";

const dateFormatter = new Intl.DateTimeFormat(AR, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(AR, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat(AR, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
  hour12: false,
});

const numberFormatter = new Intl.NumberFormat("en-US");

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

export function formatTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "—";
}

/** "منذ 3 دقائق" style relative label, useful for "آخر تحديث". */
export function formatRelative(value: string | number | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("ar-u-nu-latn", { numeric: "auto" });
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return diffMs < 0 ? "الآن" : "الآن";
  if (minutes < 60) return rtf.format(Math.sign(diffMs) * minutes, "minute");
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return rtf.format(Math.sign(diffMs) * hours, "hour");
  const days = Math.round(abs / 86_400_000);
  if (days < 30) return rtf.format(Math.sign(diffMs) * days, "day");
  const months = Math.round(abs / 2_592_000_000);
  if (months < 12) return rtf.format(Math.sign(diffMs) * months, "month");
  return rtf.format(Math.sign(diffMs) * Math.round(abs / 31_536_000_000), "year");
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "—";
  return numberFormatter.format(numeric);
}

export function formatWeight(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "—";
  return `${numberFormatter.format(Number(numeric.toFixed(3)))} كجم`;
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = "SAR",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "—";
  const symbols: Record<string, string> = { SAR: "ر.س", USD: "$" };
  const symbol = symbols[currency] ?? currency;
  return `${numberFormatter.format(numeric)} ${symbol}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export function formatDateOnlyISO(value: string | null | undefined): string {
  if (!value) return "—";
  const date = toDate(value);
  if (!date) return value;
  return dateFormatter.format(date);
}

/** Anything shaped like an address row, its form input, or a frozen snapshot. */
export type AddressLike = {
  recipientName?: string | null;
  phone?: string | null;
  city?: string | null;
  district?: string | null;
  street?: string | null;
  buildingNumber?: string | null;
  secondaryNumber?: string | null;
  postalCode?: string | null;
  nationalAddressShortCode?: string | null;
  addressDetails?: string | null;
};

/**
 * Formats a Saudi National Address as a single readable line following the
 * customary order: street + building, district + city, postal code (+ Short
 * Code when present). Missing parts are skipped silently.
 */
export function formatNationalAddress(address: AddressLike | null | undefined): string {
  if (!address) return "—";
  const parts: Array<string> = [];
  const line = [
    address.street,
    address.buildingNumber ? `مبنى ${address.buildingNumber}` : null,
    address.secondaryNumber ? `فرعي ${address.secondaryNumber}` : null,
  ]
    .filter(Boolean)
    .join("، ");
  if (line) parts.push(line);
  const area = [address.district, address.city].filter(Boolean).join("، ");
  if (area) parts.push(area);
  const codes = [
    address.postalCode,
    address.nationalAddressShortCode
      ? `Short Code: ${address.nationalAddressShortCode}`
      : null,
  ]
    .filter(Boolean)
    .join(" — ");
  if (codes) parts.push(codes);
  if (address.addressDetails) parts.push(address.addressDetails);
  return parts.length > 0 ? parts.join(" / ") : "—";
}
