/**
 * Reports. Every report returns the same shape (columns + rows + totals) so the screen,
 * CSV export and print/PDF view share one implementation.
 */
import type { TxType } from "@prisma/client";
import { Prisma, db } from "./db";
import { requirePermission, resolveBranchFilter, type Actor } from "./rbac";
import { getSettings } from "./settings";
import { listInventory, scopeSql } from "./inventory/queries";
import { supplierPerformance } from "./suppliers";
import { num } from "@/lib/num";

export const REPORT_TYPES = [
  "valuation",
  "movements",
  "consumption",
  "employees",
  "low-stock",
  "replenishment",
  "suppliers",
  "branches",
  "adjustments",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ColumnType = "text" | "number" | "money" | "date" | "datetime" | "percent" | "status" | "txtype" | "unit";
export interface Column {
  key: string;
  /** i18n key under "reports.col.*" */
  label: string;
  type: ColumnType;
}
export type Row = Record<string, string | number | null | Date>;
export interface Report {
  type: ReportType;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  truncated?: boolean;
  /** Optional chart series: label key + numeric key. */
  chart?: { kind: "bar" | "line"; x: string; series: string[] };
}

export interface ReportFilters {
  from: Date;
  to: Date;
  branchId?: string | null;
  productId?: string | null;
  categoryId?: string | null;
  userId?: string | null;
  type?: TxType | null;
}

const MAX_ROWS = 20000;

const c = (key: string, type: ColumnType = "text"): Column => ({ key, label: key, type });

function txConds(branches: string[] | "ALL", f: ReportFilters, alias = "t") {
  const a = Prisma.raw(alias);
  const conds: Prisma.Sql[] = [
    scopeSql(branches, Prisma.sql`${a}.branch_id`),
    Prisma.sql`${a}.created_at >= ${f.from}`,
    Prisma.sql`${a}.created_at < ${f.to}`,
  ];
  if (f.productId) conds.push(Prisma.sql`${a}.product_id = ${f.productId}`);
  if (f.userId) conds.push(Prisma.sql`${a}.user_id = ${f.userId}`);
  if (f.type) conds.push(Prisma.sql`${a}.type::text = ${f.type}`);
  if (f.categoryId) conds.push(Prisma.sql`p.category_id = ${f.categoryId}`);
  return Prisma.join(conds, " AND ");
}

export async function runReport(actor: Actor, type: ReportType, f: ReportFilters): Promise<Report> {
  requirePermission(actor, "reports.view");
  const branches = resolveBranchFilter(actor, f.branchId);

  switch (type) {
    case "valuation": {
      const conds: Prisma.Sql[] = [scopeSql(branches), Prisma.sql`p.status = 'ACTIVE'`];
      if (f.productId) conds.push(Prisma.sql`p.id = ${f.productId}`);
      if (f.categoryId) conds.push(Prisma.sql`p.category_id = ${f.categoryId}`);
      const rows = await db.$queryRaw<Row[]>`
        SELECT b.code AS branch, COALESCE(b.name_ar, b.name) AS branch_name, p.sku, COALESCE(p.name_ar, p.name) AS product,
          COALESCE(cat.name_ar, cat.name) AS category, p.base_unit::text AS unit,
          bi.quantity::float AS quantity, p.cost_price::float AS unit_cost, (bi.quantity * p.cost_price)::float AS value
        FROM branch_inventory bi JOIN products p ON p.id = bi.product_id JOIN branches b ON b.id = bi.branch_id
        LEFT JOIN product_categories cat ON cat.id = p.category_id
        WHERE ${Prisma.join(conds, " AND ")} AND bi.quantity <> 0
        ORDER BY value DESC LIMIT ${MAX_ROWS}`;
      return {
        type,
        columns: [c("branch"), c("product"), c("sku"), c("category"), c("quantity", "number"), c("unit", "unit"), c("unit_cost", "money"), c("value", "money")],
        rows,
        totals: { quantity: sum(rows, "quantity"), value: sum(rows, "value") },
        truncated: rows.length >= MAX_ROWS,
      };
    }

    case "movements": {
      const rows = await db.$queryRaw<Row[]>`
        SELECT 'TX-' || t.seq AS ref, t.created_at AS date, b.code AS branch, COALESCE(p.name_ar, p.name) AS product, p.sku,
          t.type::text AS type, t.quantity::float AS quantity, p.base_unit::text AS unit,
          t.previous_qty::float AS previous, t.new_qty::float AS new, (ABS(t.quantity) * t.unit_cost)::float AS value,
          u.name AS user, t.reason
        FROM inventory_transactions t JOIN products p ON p.id = t.product_id JOIN branches b ON b.id = t.branch_id JOIN users u ON u.id = t.user_id
        WHERE ${txConds(branches, f)}
        ORDER BY t.seq DESC LIMIT ${MAX_ROWS}`;
      return {
        type,
        columns: [c("ref"), c("date", "datetime"), c("branch"), c("product"), c("sku"), c("type", "txtype"), c("quantity", "number"), c("unit", "unit"), c("previous", "number"), c("new", "number"), c("value", "money"), c("user"), c("reason")],
        rows,
        truncated: rows.length >= MAX_ROWS,
      };
    }

    case "consumption": {
      const days = Math.max(1, (f.to.getTime() - f.from.getTime()) / 86400000);
      const rows = await db.$queryRaw<Row[]>`
        SELECT COALESCE(p.name_ar, p.name) AS product, p.sku, COALESCE(cat.name_ar, cat.name) AS category, p.base_unit::text AS unit,
          SUM(CASE WHEN t.type = 'CONSUMPTION' THEN -t.quantity ELSE 0 END)::float AS consumed,
          SUM(CASE WHEN t.type = 'WITHDRAWAL' THEN -t.quantity ELSE 0 END)::float AS withdrawn,
          SUM(CASE WHEN t.type = 'RETURN' THEN t.quantity ELSE 0 END)::float AS returned,
          SUM(-t.quantity)::float AS net,
          SUM(-t.quantity * t.unit_cost)::float AS value,
          COUNT(*)::int AS transactions
        FROM inventory_transactions t JOIN products p ON p.id = t.product_id
        LEFT JOIN product_categories cat ON cat.id = p.category_id
        WHERE ${txConds(branches, { ...f, type: null })} AND t.type IN ('CONSUMPTION','WITHDRAWAL','RETURN')
        GROUP BY p.id, p.name, p.name_ar, p.sku, cat.name, cat.name_ar, p.base_unit
        ORDER BY net DESC LIMIT ${MAX_ROWS}`;
      const withRate = rows.map((r) => ({ ...r, per_day: Math.round((num(r.net as number) / days) * 100) / 100 }));
      return {
        type,
        columns: [c("product"), c("sku"), c("category"), c("consumed", "number"), c("withdrawn", "number"), c("returned", "number"), c("net", "number"), c("unit", "unit"), c("per_day", "number"), c("value", "money"), c("transactions", "number")],
        rows: withRate,
        totals: { value: sum(rows, "value"), transactions: sum(rows, "transactions") },
        chart: { kind: "bar", x: "product", series: ["net"] },
      };
    }

    case "employees": {
      const rows = await db.$queryRaw<Row[]>`
        SELECT u.name AS user, u.role::text AS role, COUNT(*)::int AS transactions,
          COUNT(*) FILTER (WHERE t.type = 'CONSUMPTION')::int AS consumption,
          COUNT(*) FILTER (WHERE t.type = 'WITHDRAWAL')::int AS withdrawal,
          COUNT(*) FILTER (WHERE t.type = 'RETURN')::int AS returns,
          COUNT(*) FILTER (WHERE t.type IN ('STOCK_RECEIPT','PURCHASE_RECEIPT','TRANSFER_IN'))::int AS receipts,
          COUNT(*) FILTER (WHERE t.type IN ('ADJUSTMENT','COUNT_CORRECTION','DAMAGED','EXPIRED'))::int AS adjustments,
          SUM(CASE WHEN t.quantity < 0 THEN -t.quantity * t.unit_cost ELSE 0 END)::float AS outflow_value,
          MAX(t.created_at) AS last_activity
        FROM inventory_transactions t JOIN users u ON u.id = t.user_id JOIN products p ON p.id = t.product_id
        WHERE ${txConds(branches, f)}
        GROUP BY u.id, u.name, u.role
        ORDER BY transactions DESC`;
      return {
        type,
        columns: [c("user"), c("role", "status"), c("transactions", "number"), c("consumption", "number"), c("withdrawal", "number"), c("returns", "number"), c("receipts", "number"), c("adjustments", "number"), c("outflow_value", "money"), c("last_activity", "datetime")],
        rows,
        totals: { transactions: sum(rows, "transactions"), outflow_value: sum(rows, "outflow_value") },
        chart: { kind: "bar", x: "user", series: ["transactions"] },
      };
    }

    case "low-stock": {
      const inv = await listInventory(actor, { branchId: f.branchId, categoryId: f.categoryId, state: "ATTENTION", pageSize: 500, sort: "state" });
      const rows = inv.rows.map((r) => ({
        branch: r.branchCode,
        product: r.nameAr || r.name,
        sku: r.sku,
        state: r.state,
        available: r.available,
        min: r.minStock,
        unit: r.baseUnit,
        days_remaining: r.daysRemaining,
        adc: r.avgDailyConsumption,
        pending: r.pending ? "YES" : "NO",
      }));
      return {
        type,
        columns: [c("branch"), c("product"), c("sku"), c("state", "status"), c("available", "number"), c("min", "number"), c("unit", "unit"), c("days_remaining", "number"), c("adc", "number"), c("pending", "status")],
        rows,
      };
    }

    case "replenishment": {
      const rows = await db.$queryRaw<Row[]>`
        SELECT 'REQ-' || r.seq AS ref, r.created_at AS date, b.code AS branch, s.name AS supplier, r.status::text AS status, r.source::text AS source,
          COUNT(i.id)::int AS items, SUM(i.requested_qty)::float AS requested, SUM(i.received_qty)::float AS received,
          SUM(i.requested_qty * i.unit_cost)::float AS value, SUM(i.received_qty * i.unit_cost)::float AS received_value,
          r.approved_at AS approved, r.completed_at AS completed,
          CASE WHEN r.completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (r.completed_at - r.created_at)) / 86400 END::float AS cycle_days
        FROM replenishment_requests r JOIN branches b ON b.id = r.branch_id LEFT JOIN suppliers s ON s.id = r.supplier_id
        LEFT JOIN replenishment_request_items i ON i.request_id = r.id
        WHERE ${scopeSql(branches, Prisma.sql`r.branch_id`)} AND r.created_at >= ${f.from} AND r.created_at < ${f.to}
          ${f.productId ? Prisma.sql`AND EXISTS (SELECT 1 FROM replenishment_request_items x WHERE x.request_id = r.id AND x.product_id = ${f.productId})` : Prisma.empty}
        GROUP BY r.id, b.code, s.name
        ORDER BY r.created_at DESC LIMIT ${MAX_ROWS}`;
      return {
        type,
        columns: [c("ref"), c("date", "datetime"), c("branch"), c("supplier"), c("status", "status"), c("source", "status"), c("items", "number"), c("requested", "number"), c("received", "number"), c("value", "money"), c("received_value", "money"), c("cycle_days", "number")],
        rows,
        totals: { value: sum(rows, "value"), received_value: sum(rows, "received_value") },
      };
    }

    case "suppliers": {
      const perf = await supplierPerformance(actor, f.from, f.to);
      return {
        type,
        columns: [c("supplier"), c("requests", "number"), c("completed", "number"), c("cancelled", "number"), c("fill_rate", "percent"), c("on_time_rate", "percent"), c("avg_lead_days", "number"), c("promised_lead_days", "number")],
        rows: perf.map((p) => ({
          supplier: p.name,
          requests: p.requests,
          completed: p.completed,
          cancelled: p.cancelled,
          fill_rate: p.fillRate,
          on_time_rate: p.onTimeRate,
          avg_lead_days: p.avgLeadDays === null ? null : Math.round(p.avgLeadDays * 10) / 10,
          promised_lead_days: p.promisedLeadDays,
        })),
      };
    }

    case "branches": {
      const rows = await branchComparison(actor, f);
      return {
        type,
        columns: [c("branch"), c("products", "number"), c("value", "money"), c("availability", "percent"), c("low", "number"), c("critical", "number"), c("out", "number"), c("consumption_value", "money"), c("requests", "number"), c("received_value", "money")],
        rows,
        totals: { value: sum(rows, "value"), consumption_value: sum(rows, "consumption_value") },
        chart: { kind: "bar", x: "branch", series: ["value", "consumption_value"] },
      };
    }

    case "adjustments": {
      const rows = await db.$queryRaw<Row[]>`
        SELECT 'TX-' || t.seq AS ref, t.created_at AS date, b.code AS branch, COALESCE(p.name_ar, p.name) AS product, p.sku, t.type::text AS type,
          t.quantity::float AS quantity, p.base_unit::text AS unit, (t.quantity * t.unit_cost)::float AS value, u.name AS user, t.reason,
          rb.name AS approved_by
        FROM inventory_transactions t JOIN products p ON p.id = t.product_id JOIN branches b ON b.id = t.branch_id JOIN users u ON u.id = t.user_id
        LEFT JOIN stock_adjustment_requests ar ON ar.id = t.adjustment_id LEFT JOIN users rb ON rb.id = ar.reviewed_by_id
        WHERE ${txConds(branches, f)} AND t.type IN ('ADJUSTMENT','COUNT_CORRECTION','DAMAGED','EXPIRED')
        ORDER BY t.seq DESC LIMIT ${MAX_ROWS}`;
      return {
        type,
        columns: [c("ref"), c("date", "datetime"), c("branch"), c("product"), c("sku"), c("type", "txtype"), c("quantity", "number"), c("unit", "unit"), c("value", "money"), c("user"), c("approved_by"), c("reason")],
        rows,
        totals: { value: sum(rows, "value") },
      };
    }
  }
}

function sum(rows: Row[], key: string) {
  return Math.round(rows.reduce((s, r) => s + num(r[key] as number), 0) * 100) / 100;
}

export async function branchComparison(actor: Actor, f: { from: Date; to: Date; branchId?: string | null }) {
  const branches = resolveBranchFilter(actor, f.branchId);
  const settings = await getSettings();
  const pct = settings.criticalPercent;
  return db.$queryRaw<Row[]>`
    WITH inv AS (
      SELECT bi.branch_id,
        COUNT(*)::int AS products,
        SUM(bi.quantity * p.cost_price)::float AS value,
        COUNT(*) FILTER (WHERE bi.min_stock > 0)::int AS monitored,
        COUNT(*) FILTER (WHERE bi.min_stock > 0 AND (bi.quantity - bi.reserved) > 0)::int AS available_n,
        COUNT(*) FILTER (WHERE bi.min_stock > 0 AND (bi.quantity - bi.reserved) > COALESCE(bi.critical_stock, bi.min_stock * ${pct} / 100.0) AND (bi.quantity - bi.reserved) <= bi.min_stock)::int AS low,
        COUNT(*) FILTER (WHERE bi.min_stock > 0 AND (bi.quantity - bi.reserved) > 0 AND (bi.quantity - bi.reserved) <= COALESCE(bi.critical_stock, bi.min_stock * ${pct} / 100.0))::int AS critical,
        COUNT(*) FILTER (WHERE (bi.quantity - bi.reserved) <= 0 AND bi.min_stock > 0)::int AS out
      FROM branch_inventory bi JOIN products p ON p.id = bi.product_id AND p.status = 'ACTIVE'
      GROUP BY bi.branch_id
    ), cons AS (
      SELECT t.branch_id, SUM(-t.quantity * t.unit_cost)::float AS consumption_value
      FROM inventory_transactions t
      WHERE t.type IN ('CONSUMPTION','WITHDRAWAL') AND t.created_at >= ${f.from} AND t.created_at < ${f.to}
      GROUP BY t.branch_id
    ), req AS (
      SELECT r.branch_id, COUNT(DISTINCT r.id)::int AS requests
      FROM replenishment_requests r WHERE r.created_at >= ${f.from} AND r.created_at < ${f.to} GROUP BY r.branch_id
    ), rec AS (
      SELECT t.branch_id, SUM(t.quantity * t.unit_cost)::float AS received_value
      FROM inventory_transactions t WHERE t.type = 'PURCHASE_RECEIPT' AND t.created_at >= ${f.from} AND t.created_at < ${f.to}
      GROUP BY t.branch_id
    )
    SELECT b.id AS branch_id, b.code AS branch, COALESCE(b.name_ar, b.name) AS branch_name,
      COALESCE(inv.products, 0) AS products, COALESCE(inv.value, 0) AS value,
      CASE WHEN COALESCE(inv.monitored, 0) > 0 THEN inv.available_n::float / inv.monitored END AS availability,
      COALESCE(inv.low, 0) AS low, COALESCE(inv.critical, 0) AS critical, COALESCE(inv.out, 0) AS out,
      COALESCE(cons.consumption_value, 0) AS consumption_value, COALESCE(req.requests, 0) AS requests,
      COALESCE(rec.received_value, 0) AS received_value
    FROM branches b
    LEFT JOIN inv ON inv.branch_id = b.id LEFT JOIN cons ON cons.branch_id = b.id
    LEFT JOIN req ON req.branch_id = b.id LEFT JOIN rec ON rec.branch_id = b.id
    WHERE b.status = 'ACTIVE' AND ${scopeSql(branches, Prisma.sql`b.id`)}
    ORDER BY b.code`;
}

/** CSV with BOM so Excel opens Arabic correctly. */
export function toCsv(report: Report, label: (key: string) => string, format: (col: Column, v: unknown) => string) {
  const esc = (s: string) => {
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [report.columns.map((col) => esc(label(col.label))).join(",")];
  for (const r of report.rows) lines.push(report.columns.map((col) => esc(format(col, r[col.key]))).join(","));
  return "﻿" + lines.join("\r\n");
}
