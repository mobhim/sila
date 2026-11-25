import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getActor } from "@/server/auth/current";
import { makeT, type Locale } from "./index";

export const LOCALE_COOKIE = "sf_locale";

export const getLocale = cache(async (): Promise<Locale> => {
  const actor = await getActor().catch(() => null);
  if (actor?.locale === "en" || actor?.locale === "ar") return actor.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return c === "en" ? "en" : "ar";
});

export async function getT() {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}

import * as f from "./format";
import { getSettings } from "@/server/settings";

/** Translator + formatters for server components. */
export async function getFmt() {
  const locale = await getLocale();
  const settings = await getSettings();
  return {
    locale,
    t: makeT(locale),
    showHijri: settings.showHijri,
    num: (n: number | null | undefined, d?: number) => f.fmtNumber(n, locale, d),
    money: (n: number | null | undefined, compact?: boolean) => f.fmtMoney(n, locale, compact),
    pct: (n: number | null | undefined) => f.fmtPercent(n, locale),
    date: (d: Date | string | null | undefined) => f.fmtDate(d, locale),
    dateTime: (d: Date | string | null | undefined) => f.fmtDateTime(d, locale),
    hijri: (d: Date | string | null | undefined) => f.fmtHijri(d, locale),
  };
}
export type Fmt = Awaited<ReturnType<typeof getFmt>>;
