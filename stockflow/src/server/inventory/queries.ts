import { Prisma, db } from "../db";
import { AppError, notFound } from "../errors";
import { assertBranchAccess, branchScope, requirePermission, resolveBranchFilter, type Actor } from "../rbac";
import { getSettings } from "../settings";
import { audit, diff } from "../audit";
import { evaluateAlert } from "../alerts";
import { daysRemaining, type StockState } from "./calc";
import { num } from "@/lib/num";

export interface InventoryFilters {
  branchId?: string | null;
  q?: string | null;
  categoryId?: string | null;
  state?: StockState | "ATTENTION" | null;
  page?: number;
  pageSize?: number;
  sort?: "name" | "available" | "days" | "value" | "state";
}

export interface InventoryRow {
  id: string;
  branchId: string;
  branchName: string;
  branchNameAr: string | null;
  branchCode: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  nameAr: string | null;
  baseUnit: string;
  categoryName: string | null;
  categoryNameAr: string | null;
  quantity: number;
  reserved: number;
  available: number;
  minStock: number;
  criticalLevel: number;
  reorderQty: number;
  maxStock: number;
  safetyStock: number;
  avgDailyConsumption: number;
  daysRemaining: number | null;
  costPrice: number;
  value: number;
  state: StockState;
  pending: boolean;
  lastMovementAt: Date | null;
}

function stateSql(pct: number) {
  return Prisma.sql`CASE
    WHEN (bi.quantity - bi.reserved) <= 0 THEN 'OUT_OF_STOCK'
    WHEN bi.min_stock <= 0 THEN 'NORMAL'
    WHEN (bi.quantity - bi.reserved) <= COALESCE(bi.critical_stock, bi.min_stock * ${pct} / 100.0) THEN 'CRITICAL'
    WHEN (bi.quantity - bi.reserved) <= bi.min_stock THEN 'LOW'
    ELSE 'NORMAL' END`;
}

export function scopeSql(branches: string[] | "ALL", col = Prisma.sql`bi.branch_id`) {
  if (branches === "ALL") return Prisma.sql`TRUE`;
  if (!branches.length) return Prisma.sql`FALSE`;
  return Prisma.sql`${col} IN (${Prisma.join(branches)})`;
}

export async function listInventory(actor: Actor, f: InventoryFilters) {
  requirePermission(actor, "inventory.view");
  const branches = resolveBranchFilter(actor, f.branchId);
  const settings = await getSettings();
  const pageSize = Math.min(f.pageSize ?? 50, 500);
  const page = Math.max(1, f.page ?? 1);
  const state = stateSql(settings.criticalPercent);

  const conds: Prisma.Sql[] = [scopeSql(branches), Prisma.sql`p.status = 'ACTIVE'`];
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    conds.push(Prisma.sql`(p.name ILIKE ${like} OR p.name_ar ILIKE ${like} OR p.sku ILIKE ${like} OR p.barcode = ${f.q.trim()})`);
  }
  if (f.categoryId) conds.push(Prisma.sql`p.category_id = ${f.categoryId}`);
  const where = Prisma.join(conds, " AND ");

  const stateFilter =
    f.state === "ATTENTION"
      ? Prisma.sql`WHERE x.state <> 'NORMAL'`
      : f.state
        ? Prisma.sql`WHERE x.state = ${f.state}`
        : Prisma.empty;

  const order = {
    name: Prisma.sql`x.name ASC`,
    available: Prisma.sql`x.available ASC`,
    days: Prisma.sql`x.days_remaining ASC NULLS LAST`,
    value: Prisma.sql`x.value DESC`,
    state: Prisma.sql`CASE x.state WHEN 'OUT_OF_STOCK' THEN 0 WHEN 'CRITICAL' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END, x.name ASC`,
  }[f.sort ?? "state"];

  const base = Prisma.sql`
    SELECT bi.id, bi.branch_id, b.name AS branch_name, b.name_ar AS branch_name_ar, b.code AS branch_code,
      p.id AS product_id, p.sku, p.barcode, p.name, p.name_ar, p.base_unit::text AS base_unit,
      c.name AS category_name, c.name_ar AS category_name_ar,
      bi.quantity, bi.reserved, (bi.quantity - bi.reserved) AS available,
      bi.min_stock, COALESCE(bi.critical_stock, bi.min_stock * ${settings.criticalPercent} / 100.0) AS critical_level,
      bi.reorder_qty, bi.max_stock, bi.safety_stock, bi.avg_daily_consumption,
      CASE WHEN bi.avg_daily_consumption > 0 THEN (bi.quantity - bi.reserved) / bi.avg_daily_consumption END AS days_remaining,
      p.cost_price, (bi.quantity * p.cost_price) AS value,
      ${state} AS state,
      EXISTS (SELECT 1 FROM stock_alerts a WHERE a.branch_id = bi.branch_id AND a.product_id = bi.product_id AND a.status = 'REPLENISHMENT_PENDING') AS pending,
      bi.last_movement_at
    FROM branch_inventory bi
    JOIN products p ON p.id = bi.product_id
    JOIN branches b ON b.id = bi.branch_id
    LEFT JOIN product_categories c ON c.id = p.category_id
    WHERE ${where}`;

  const [rows, countRows] = await Promise.all([
    db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM (${base}) x ${stateFilter} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM (${base}) x ${stateFilter}`,
  ]);

  return {
    rows: rows.map(mapRow),
    total: Number(countRows[0]?.n ?? 0),
    page,
    pageSize,
  };
}

function mapRow(r: Record<string, unknown>): InventoryRow {
  const available = num(r.available as string);
  const adc = num(r.avg_daily_consumption as string);
  return {
    id: r.id as string,
    branchId: r.branch_id as string,
    branchName: r.branch_name as string,
    branchNameAr: (r.branch_name_ar as string) ?? null,
    branchCode: r.branch_code as string,
    productId: r.product_id as string,
    sku: r.sku as string,
    barcode: (r.barcode as string) ?? null,
    name: r.name as string,
    nameAr: (r.name_ar as string) ?? null,
    baseUnit: r.base_unit as string,
    categoryName: (r.category_name as string) ?? null,
    categoryNameAr: (r.category_name_ar as string) ?? null,
    quantity: num(r.quantity as string),
    reserved: num(r.reserved as string),
    available,
    minStock: num(r.min_stock as string),
    criticalLevel: num(r.critical_level as string),
    reorderQty: num(r.reorder_qty as string),
    maxStock: num(r.max_stock as string),
    safetyStock: num(r.safety_stock as string),
    avgDailyConsumption: adc,
    daysRemaining: daysRemaining(available, adc),
    costPrice: num(r.cost_price as string),
    value: num(r.value as string),
    state: r.state as StockState,
    pending: Boolean(r.pending),
    lastMovementAt: (r.last_movement_at as Date) ?? null,
  };
}

/** Product × branch matrix for the comparison view. */
export async function compareInventory(actor: Actor, f: { q?: string | null; categoryId?: string | null; page?: number }) {
  requirePermission(actor, "inventory.view");
  const scope = branchScope(actor);
  const branches = await db.branch.findMany({
    where: { ...(scope === "ALL" ? {} : { id: { in: scope } }), status: "ACTIVE" },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, nameAr: true },
  });
  const all = await listInventory(actor, { q: f.q, categoryId: f.categoryId, pageSize: 500, sort: "name" });
  const products = new Map<string, { productId: string; name: string; nameAr: string | null; sku: string; baseUnit: string; cells: Record<string, InventoryRow> }>();
  for (const r of all.rows) {
    const e = products.get(r.productId) ?? { productId: r.productId, name: r.name, nameAr: r.nameAr, sku: r.sku, baseUnit: r.baseUnit, cells: {} };
    e.cells[r.branchId] = r;
    products.set(r.productId, e);
  }
  return { branches, products: [...products.values()] };
}

export interface ThresholdInput {
  minStock: number;
  criticalStock: number | null;
  reorderQty: number;
  maxStock: number;
  safetyStock: number;
}

export async function updateThresholds(actor: Actor, branchId: string, productId: string, t: ThresholdInput) {
  requirePermission(actor, "inventory.thresholds");
  assertBranchAccess(actor, branchId);
  for (const v of [t.minStock, t.reorderQty, t.maxStock, t.safetyStock, t.criticalStock ?? 0]) {
    if (!(v >= 0) || !Number.isFinite(v)) throw new AppError("quantity_invalid");
  }
  if (t.maxStock > 0 && t.maxStock < t.minStock) throw new AppError("max_below_min");
  if (t.criticalStock !== null && t.criticalStock > t.minStock) throw new AppError("critical_above_min");
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO branch_inventory (id, branch_id, product_id, updated_at)
      VALUES ('inv_' || md5(${branchId} || ':' || ${productId}), ${branchId}, ${productId}, NOW())
      ON CONFLICT (branch_id, product_id) DO NOTHING`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM branch_inventory WHERE branch_id = ${branchId} AND product_id = ${productId} FOR UPDATE`;
    const before = await tx.branchInventory.findUniqueOrThrow({ where: { id: rows[0].id } });
    const after = await tx.branchInventory.update({
      where: { id: rows[0].id },
      data: { minStock: t.minStock, criticalStock: t.criticalStock, reorderQty: t.reorderQty, maxStock: t.maxStock, safetyStock: t.safetyStock },
    });
    const d = diff(
      { minStock: num(before.minStock), criticalStock: before.criticalStock === null ? null : num(before.criticalStock), reorderQty: num(before.reorderQty), maxStock: num(before.maxStock), safetyStock: num(before.safetyStock) },
      t as unknown as Record<string, unknown>,
    );
    if (d.changed) {
      await audit(actor, { action: "inventory.thresholds", entityType: "branch_inventory", entityId: after.id, branchId, summary: product.sku, before: d.before, after: d.after }, tx);
    }
    await evaluateAlert(tx, after.id, actor);
  });
}

/** Search active products for the recording screen, with the branch's stock. */
export async function searchProductsForBranch(actor: Actor, branchId: string, q: string, limit = 20) {
  requirePermission(actor, "products.view");
  assertBranchAccess(actor, branchId);
  const term = q.trim();
  const products = await db.product.findMany({
    where: {
      status: "ACTIVE",
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { nameAr: { contains: term, mode: "insensitive" } },
              { sku: { contains: term, mode: "insensitive" } },
              { barcode: term },
              { units: { some: { barcode: term } } },
            ],
          }
        : {}),
    },
    include: { units: true, inventory: { where: { branchId } } },
    orderBy: { name: "asc" },
    take: limit,
  });
  return products.map((p) => productForRecording(p));
}

export function productForRecording(p: {
  id: string; sku: string; barcode: string | null; name: string; nameAr: string | null; baseUnit: string; imageId: string | null;
  units: { unit: string; factor: Prisma.Decimal; barcode: string | null }[];
  inventory: { quantity: Prisma.Decimal; reserved: Prisma.Decimal }[];
}) {
  const inv = p.inventory[0];
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode,
    name: p.name,
    nameAr: p.nameAr,
    baseUnit: p.baseUnit,
    imageId: p.imageId,
    units: p.units.map((u) => ({ unit: u.unit, factor: num(u.factor), barcode: u.barcode })),
    available: inv ? num(inv.quantity) - num(inv.reserved) : 0,
  };
}

export type RecordingProduct = ReturnType<typeof productForRecording>;

/** Find a product by any of its barcodes (product or unit). Returns the matched unit. */
export async function findByBarcode(actor: Actor, branchId: string, code: string) {
  requirePermission(actor, "products.view");
  assertBranchAccess(actor, branchId);
  const c = code.trim();
  if (!c) return null;
  const p = await db.product.findFirst({
    where: { status: "ACTIVE", OR: [{ barcode: c }, { units: { some: { barcode: c } } }, { sku: c }] },
    include: { units: true, inventory: { where: { branchId } } },
  });
  if (!p) return null;
  const unit = p.units.find((u) => u.barcode === c)?.unit ?? p.baseUnit;
  return { product: productForRecording(p), unit };
}
