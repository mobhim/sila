import { core } from "./messages/core";
import { auth } from "./messages/auth";
import { dashboard } from "./messages/dashboard";
import { branches } from "./messages/branches";
import { products } from "./messages/products";
import { inventory } from "./messages/inventory";
import { transactions } from "./messages/transactions";
import { record } from "./messages/record";
import { alerts } from "./messages/alerts";
import { replenishment } from "./messages/replenishment";
import { suppliers } from "./messages/suppliers";
import { supplierPortal } from "./messages/supplierPortal";
import { transfers } from "./messages/transfers";
import { counts } from "./messages/counts";
import { adjustments } from "./messages/adjustments";
import { reports } from "./messages/reports";
import { users } from "./messages/users";
import { notifications } from "./messages/notifications";
import { audit } from "./messages/audit";
import { settings } from "./messages/settings";
import { profile } from "./messages/profile";

export type Locale = "ar" | "en";
export const LOCALES: Locale[] = ["ar", "en"];
export type Dict = Record<string, unknown>;

const areas = { auth, dashboard, branches, products, inventory, transactions, record, alerts, replenishment, suppliers, supplierPortal, transfers, counts, adjustments, reports, users, notifications, audit, settings, profile };

function build(locale: Locale): Dict {
  const d: Dict = { ...core[locale] };
  for (const [k, v] of Object.entries(areas)) d[k] = v[locale];
  return d;
}

export const DICTIONARIES: Record<Locale, Dict> = { ar: build("ar"), en: build("en") };

export function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Dict)) cur = (cur as Dict)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export type TFunction = (key: string, params?: Record<string, string | number | null | undefined>) => string;

export function makeT(locale: Locale): TFunction {
  const dict = DICTIONARIES[locale];
  const fallback = DICTIONARIES.en;
  return (key, params) => {
    const s = lookup(dict, key) ?? lookup(fallback, key) ?? key;
    return params ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? "")) : s;
  };
}

export const dirOf = (l: Locale) => (l === "ar" ? "rtl" : "ltr");
