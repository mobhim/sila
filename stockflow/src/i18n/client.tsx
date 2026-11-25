"use client";
import { createContext, useContext, useMemo } from "react";
import { DICTIONARIES, makeT, type Locale, type TFunction } from "./index";
import * as f from "./format";

interface Ctx {
  locale: Locale;
  t: TFunction;
  showHijri: boolean;
}

const I18nContext = createContext<Ctx>({ locale: "ar", t: makeT("ar"), showHijri: false });

export function I18nProvider({ locale, showHijri, children }: { locale: Locale; showHijri: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale), showHijri }), [locale, showHijri]);
  void DICTIONARIES;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const { locale, t, showHijri } = useContext(I18nContext);
  return {
    locale,
    t,
    showHijri,
    num: (n: number | null | undefined, d?: number) => f.fmtNumber(n, locale, d),
    money: (n: number | null | undefined, compact?: boolean) => f.fmtMoney(n, locale, compact),
    pct: (n: number | null | undefined) => f.fmtPercent(n, locale),
    date: (d: Date | string | null | undefined) => f.fmtDate(d, locale),
    dateTime: (d: Date | string | null | undefined) => f.fmtDateTime(d, locale),
    hijri: (d: Date | string | null | undefined) => f.fmtHijri(d, locale),
  };
}
