import "server-only";
import type { TxType } from "@prisma/client";
import { db } from "./db";
import { branchScope, requirePermission, type Actor } from "./rbac";
import { REPORT_TYPES, type ReportFilters, type ReportType } from "./reports";
import { isoDay, TIME_ZONE } from "@/i18n/format";

const TX_TYPES: TxType[] = [
  "INITIAL_STOCK", "CONSUMPTION", "WITHDRAWAL", "STOCK_RECEIPT", "PURCHASE_RECEIPT", "RETURN",
  "DAMAGED", "EXPIRED", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT", "COUNT_CORRECTION",
];
export const REPORT_TX_TYPES = TX_TYPES;

/** Users whose activity the actor may filter by (owner: all staff; manager: staff of their branches). */
export async function employeeOptions(actor: Actor) {
  requirePermission(actor, "reports.view");
  const scope = branchScope(actor);
  return db.user.findMany({
    where: {
      role: { not: "SUPPLIER" },
      ...(scope === "ALL" ? {} : { branches: { some: { branchId: { in: scope } } } }),
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
}

export async function productOptions(actor: Actor) {
  requirePermission(actor, "reports.view");
  return db.product.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, sku: true, name: true, nameAr: true },
    orderBy: { name: "asc" },
    take: 3000,
  });
}

/** UTC instant of 00:00 on `day` (yyyy-mm-dd) in the business time zone. */
export function zonedMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(guess))
    .reduce<Record<string, number>>((o, p) => (p.type !== "literal" ? { ...o, [p.type]: Number(p.value) } : o), {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(guess - (asUtc - guess));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface ParsedReport {
  type: ReportType;
  filters: ReportFilters;
  fromDay: string;
  toDay: string;
  /** Normalised query string (for export links). */
  query: string;
}

/**
 * Parse report search params. `defaultBranch` is used when no `branch` param is given;
 * `branch=all` means every branch in scope.
 */
export function parseReportParams(sp: Record<string, string | string[] | undefined>, defaultBranch: string | null): ParsedReport {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const type = (REPORT_TYPES as readonly string[]).includes(g("type") ?? "") ? (g("type") as ReportType) : "valuation";
  const now = new Date();
  let toDay = DAY.test(g("to") ?? "") ? g("to")! : isoDay(now);
  let fromDay = DAY.test(g("from") ?? "") ? g("from")! : isoDay(new Date(now.getTime() - 29 * 86400000));
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  const from = zonedMidnight(fromDay);
  const to = new Date(zonedMidnight(toDay).getTime() + 86400000);
  const branchParam = g("branch");
  const branchId = branchParam === "all" ? null : branchParam && ID.test(branchParam) ? branchParam : defaultBranch;
  const idOrNull = (k: string) => (g(k) && ID.test(g(k)!) ? g(k)! : null);
  const txType = TX_TYPES.includes(g("txType") as TxType) ? (g("txType") as TxType) : null;
  const filters: ReportFilters = { from, to, branchId, productId: idOrNull("productId"), categoryId: idOrNull("categoryId"), userId: idOrNull("userId"), type: txType };
  const q = new URLSearchParams({ type, from: fromDay, to: toDay, branch: branchId ?? "all" });
  if (filters.productId) q.set("productId", filters.productId);
  if (filters.categoryId) q.set("categoryId", filters.categoryId);
  if (filters.userId) q.set("userId", filters.userId);
  if (txType) q.set("txType", txType);
  return { type, filters, fromDay, toDay, query: q.toString() };
}

/** Which filters each report honours (others are hidden in the UI). */
export const REPORT_FILTERS: Record<ReportType, { dates: boolean; branch: boolean; product: boolean; category: boolean; user: boolean; txType: boolean }> = {
  valuation: { dates: false, branch: true, product: true, category: true, user: false, txType: false },
  movements: { dates: true, branch: true, product: true, category: true, user: true, txType: true },
  consumption: { dates: true, branch: true, product: true, category: true, user: true, txType: false },
  employees: { dates: true, branch: true, product: true, category: true, user: true, txType: true },
  "low-stock": { dates: false, branch: true, product: false, category: true, user: false, txType: false },
  replenishment: { dates: true, branch: true, product: true, category: false, user: false, txType: false },
  suppliers: { dates: true, branch: false, product: false, category: false, user: false, txType: false },
  branches: { dates: true, branch: true, product: false, category: false, user: false, txType: false },
  adjustments: { dates: true, branch: true, product: true, category: true, user: true, txType: true },
};
