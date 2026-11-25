import { Prisma, db } from "./db";
import { requirePermission, resolveBranchFilter, type Actor } from "./rbac";
import { getSettings } from "./settings";
import { scopeSql } from "./inventory/queries";
import { branchComparison } from "./reports";
import { listAlerts } from "./alerts";
import { num } from "@/lib/num";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function getDashboard(actor: Actor, branchId?: string | null) {
  requirePermission(actor, "dashboard.view");
  const branches = resolveBranchFilter(actor, branchId);
  const settings = await getSettings();
  const pct = settings.criticalPercent;
  const scope = scopeSql(branches);
  const tscope = scopeSql(branches, Prisma.sql`t.branch_id`);
  const today = startOfDay();
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const d30 = new Date(today.getTime() - 29 * 86400000);

  const [kpi] = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(DISTINCT bi.product_id)::int AS products_stocked,
      COALESCE(SUM(bi.quantity), 0)::float AS total_qty,
      COALESCE(SUM(bi.quantity * p.cost_price), 0)::float AS total_value,
      COUNT(*) FILTER (WHERE bi.min_stock > 0 AND (bi.quantity - bi.reserved) > 0
        AND (bi.quantity - bi.reserved) > COALESCE(bi.critical_stock, bi.min_stock * ${pct} / 100.0)
        AND (bi.quantity - bi.reserved) <= bi.min_stock)::int AS low,
      COUNT(*) FILTER (WHERE bi.min_stock > 0 AND (bi.quantity - bi.reserved) > 0
        AND (bi.quantity - bi.reserved) <= COALESCE(bi.critical_stock, bi.min_stock * ${pct} / 100.0))::int AS critical,
      COUNT(*) FILTER (WHERE (bi.quantity - bi.reserved) <= 0 AND (bi.min_stock > 0 OR bi.last_movement_at IS NOT NULL))::int AS out
    FROM branch_inventory bi JOIN products p ON p.id = bi.product_id AND p.status = 'ACTIVE'
    WHERE ${scope}`;

  const [cons] = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COALESCE(SUM(-t.quantity) FILTER (WHERE t.created_at >= ${today}), 0)::float AS today_qty,
      COALESCE(SUM(-t.quantity * t.unit_cost) FILTER (WHERE t.created_at >= ${today}), 0)::float AS today_value,
      COALESCE(SUM(-t.quantity), 0)::float AS month_qty,
      COALESCE(SUM(-t.quantity * t.unit_cost), 0)::float AS month_value
    FROM inventory_transactions t
    WHERE ${tscope} AND t.type IN ('CONSUMPTION','WITHDRAWAL') AND t.created_at >= ${month < today ? month : today}`;

  const branchCount = branches === "ALL" ? await db.branch.count({ where: { status: "ACTIVE" } }) : branches.length;
  const activeProducts = await db.product.count({ where: { status: "ACTIVE" } });
  const pendingRequests = await db.replenishmentRequest.count({
    where: {
      ...(branches === "ALL" ? {} : { branchId: { in: branches } }),
      status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] },
    },
  });
  const awaitingApproval = await db.replenishmentRequest.count({
    where: { ...(branches === "ALL" ? {} : { branchId: { in: branches } }), status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
  });
  const pendingAdjustments = await db.stockAdjustmentRequest.count({
    where: { ...(branches === "ALL" ? {} : { branchId: { in: branches } }), status: "PENDING" },
  });

  const trend = await db.$queryRaw<{ day: Date; inflow: number; outflow: number }[]>`
    SELECT d.day, COALESCE(SUM(t.quantity) FILTER (WHERE t.quantity > 0), 0)::float AS inflow,
      COALESCE(SUM(-t.quantity) FILTER (WHERE t.quantity < 0), 0)::float AS outflow
    FROM generate_series(${d30}::timestamp, ${today}::timestamp, interval '1 day') AS d(day)
    LEFT JOIN inventory_transactions t ON t.created_at >= d.day AND t.created_at < d.day + interval '1 day' AND ${tscope}
      AND t.type NOT IN ('TRANSFER_IN','TRANSFER_OUT')
    GROUP BY d.day ORDER BY d.day`;

  const byCategory = await db.$queryRaw<{ category: string | null; value: number; qty: number }[]>`
    SELECT COALESCE(c.name_ar, c.name) AS category, SUM(bi.quantity * p.cost_price)::float AS value, SUM(bi.quantity)::float AS qty
    FROM branch_inventory bi JOIN products p ON p.id = bi.product_id AND p.status = 'ACTIVE'
    LEFT JOIN product_categories c ON c.id = p.category_id
    WHERE ${scope} GROUP BY c.name, c.name_ar ORDER BY value DESC NULLS LAST LIMIT 10`;

  const topConsumed = await db.$queryRaw<{ product: string; qty: number; value: number; unit: string }[]>`
    SELECT COALESCE(p.name_ar, p.name) AS product, p.base_unit::text AS unit, SUM(-t.quantity)::float AS qty, SUM(-t.quantity * t.unit_cost)::float AS value
    FROM inventory_transactions t JOIN products p ON p.id = t.product_id
    WHERE ${tscope} AND t.type IN ('CONSUMPTION','WITHDRAWAL') AND t.created_at >= ${d30}
    GROUP BY p.id, p.name, p.name_ar, p.base_unit ORDER BY qty DESC LIMIT 8`;

  const lowestDays = await db.$queryRaw<{ product: string; branch: string; available: number; adc: number; days: number; unit: string }[]>`
    SELECT COALESCE(p.name_ar, p.name) AS product, b.code AS branch, p.base_unit::text AS unit, (bi.quantity - bi.reserved)::float AS available,
      bi.avg_daily_consumption::float AS adc, ((bi.quantity - bi.reserved) / bi.avg_daily_consumption)::float AS days
    FROM branch_inventory bi JOIN products p ON p.id = bi.product_id AND p.status = 'ACTIVE' JOIN branches b ON b.id = bi.branch_id
    WHERE ${scope} AND bi.avg_daily_consumption > 0
    ORDER BY days ASC LIMIT 8`;

  const fastest = await db.$queryRaw<{ product: string; branch: string; adc: number; unit: string }[]>`
    SELECT COALESCE(p.name_ar, p.name) AS product, b.code AS branch, p.base_unit::text AS unit, bi.avg_daily_consumption::float AS adc
    FROM branch_inventory bi JOIN products p ON p.id = bi.product_id AND p.status = 'ACTIVE' JOIN branches b ON b.id = bi.branch_id
    WHERE ${scope} AND bi.avg_daily_consumption > 0 ORDER BY bi.avg_daily_consumption DESC LIMIT 8`;

  const comparison = await branchComparison(actor, { from: d30, to: new Date(Date.now() + 1000), branchId });
  const alerts = await listAlerts(actor, { branchId: branchId && branchId !== "all" ? branchId : undefined, pageSize: 8 });

  return {
    kpi: {
      branches: branchCount,
      activeProducts,
      productsStocked: num(kpi.products_stocked as number),
      totalQty: num(kpi.total_qty as number),
      totalValue: num(kpi.total_value as number),
      low: num(kpi.low as number),
      critical: num(kpi.critical as number),
      out: num(kpi.out as number),
      pendingRequests,
      awaitingApproval,
      pendingAdjustments,
      consumptionTodayQty: num(cons.today_qty as number),
      consumptionTodayValue: num(cons.today_value as number),
      consumptionMonthQty: num(cons.month_qty as number),
      consumptionMonthValue: num(cons.month_value as number),
    },
    trend: trend.map((t) => ({ day: t.day.toISOString().slice(0, 10), inflow: t.inflow, outflow: t.outflow })),
    byCategory,
    topConsumed,
    lowestDays,
    fastest,
    comparison,
    alerts: alerts.rows,
    alertsTotal: alerts.total,
  };
}
