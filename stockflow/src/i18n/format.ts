/** Locale-aware formatting for Saudi Arabia: SAR, Gregorian with optional Hijri, Asia/Riyadh. */
import type { Locale } from "./index";

export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Riyadh";

const tag = (l: Locale) => (l === "ar" ? "ar-SA" : "en-SA");

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();
function nf(l: Locale, opts: Intl.NumberFormatOptions) {
  const k = `n:${l}:${JSON.stringify(opts)}`;
  let f = cache.get(k) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(`${tag(l)}-u-nu-latn`, opts);
    cache.set(k, f);
  }
  return f;
}
function df(l: Locale, cal: "gregory" | "islamic-umalqura", opts: Intl.DateTimeFormatOptions) {
  const k = `d:${l}:${cal}:${JSON.stringify(opts)}`;
  let f = cache.get(k) as Intl.DateTimeFormat | undefined;
  if (!f) {
    f = new Intl.DateTimeFormat(`${tag(l)}-u-ca-${cal}-nu-latn`, { timeZone: TIME_ZONE, ...opts });
    cache.set(k, f);
  }
  return f;
}

export function fmtNumber(n: number | null | undefined, l: Locale, maxFrac = 3) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return nf(l, { maximumFractionDigits: maxFrac }).format(n);
}

export function fmtMoney(n: number | null | undefined, l: Locale, compact = false) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return nf(l, { style: "currency", currency: "SAR", maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: compact ? 0 : 2, ...(compact ? { notation: "compact" } : {}) }).format(n);
}

export function fmtPercent(n: number | null | undefined, l: Locale) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return nf(l, { style: "percent", maximumFractionDigits: 1 }).format(n);
}

export function fmtDate(d: Date | string | null | undefined, l: Locale) {
  if (!d) return "—";
  return df(l, "gregory", { year: "numeric", month: "short", day: "numeric" }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined, l: Locale) {
  if (!d) return "—";
  return df(l, "gregory", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined, l: Locale) {
  if (!d) return "—";
  return df(l, "gregory", { hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

export function fmtHijri(d: Date | string | null | undefined, l: Locale) {
  if (!d) return "—";
  return df(l, "islamic-umalqura", { year: "numeric", month: "long", day: "numeric" }).format(new Date(d));
}

/** yyyy-mm-dd in the business time zone (for date inputs and range defaults). */
export function isoDay(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
