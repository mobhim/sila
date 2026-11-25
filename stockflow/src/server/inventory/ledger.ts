/**
 * The inventory ledger. This module is the ONLY code that changes
 * branch_inventory.quantity. Every change writes an inventory_transactions row inside the
 * same database transaction, under a row lock, and re-evaluates low-stock alerts.
 */
import type { InventoryTransaction, TxType, Unit } from "@prisma/client";
import { Prisma, db, withTx, type Tx } from "../db";
import { AppError, isUniqueViolation } from "../errors";
import type { Actor } from "../rbac";
import { getSettings } from "../settings";
import { evaluateAlert } from "../alerts";
import { num, q3 } from "@/lib/num";
import { CONSUMPTION_TYPES, TX_DIRECTION, available as availOf, signedDelta } from "./calc";

export interface MovementLine {
  productId: string;
  type: TxType;
  /**
   * Quantity in `unit`. Positive for typed movements (direction comes from the type).
   * For ADJUSTMENT / COUNT_CORRECTION, signed.
   */
  quantity: number;
  unit?: Unit;
  unitCost?: number;
  reason?: string | null;
  notes?: string | null;
  replenishmentId?: string | null;
  receiptId?: string | null;
  transferId?: string | null;
  countId?: string | null;
  adjustmentId?: string | null;
  attachmentId?: string | null;
}

export interface PostOptions {
  branchId: string;
  lines: MovementLine[];
  /** Client key; line i is stored as `${key}` (single line) or `${key}:${i}`. */
  idempotencyKey?: string | null;
  /** Bypass the negative-stock rule (never used for user-entered outflows). */
  allowNegative?: boolean;
}

export interface PostResult {
  transactions: InventoryTransaction[];
  replayed: boolean;
}

function lineKey(key: string | null | undefined, i: number, n: number) {
  if (!key) return null;
  return n === 1 ? key : `${key}:${i}`;
}

/**
 * Post one or more movements for a branch atomically. Pass `tx` to join a larger
 * workflow transaction (receiving, dispatch, count approval).
 */
export async function postMovements(actor: Actor, opts: PostOptions, tx?: Tx): Promise<PostResult> {
  if (opts.lines.length === 0) throw new AppError("no_lines");
  const n = opts.lines.length;

  // Fast path for replays (double clicks, network retries).
  if (opts.idempotencyKey && !tx) {
    const existing = await findByKey(opts.idempotencyKey, n);
    if (existing) return { transactions: existing, replayed: true };
  }

  try {
    const transactions = await withTx(tx, (t) => postInTx(t, actor, opts));
    return { transactions, replayed: false };
  } catch (e) {
    // A concurrent request with the same key won the race: return its result.
    if (opts.idempotencyKey && isUniqueViolation(e, "idempotency_key")) {
      const existing = await findByKey(opts.idempotencyKey, n);
      if (existing) return { transactions: existing, replayed: true };
    }
    throw e;
  }
}

async function findByKey(key: string, n: number) {
  const keys = Array.from({ length: n }, (_, i) => lineKey(key, i, n)!);
  const rows = await db.inventoryTransaction.findMany({ where: { idempotencyKey: { in: keys } }, orderBy: { seq: "asc" } });
  return rows.length ? rows : null;
}

interface LockedRow {
  id: string;
  product_id: string;
  quantity: Prisma.Decimal;
  reserved: Prisma.Decimal;
}

async function postInTx(tx: Tx, actor: Actor, opts: PostOptions): Promise<InventoryTransaction[]> {
  const { branchId, lines } = opts;
  const settings = await getSettings(tx);

  const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true, status: true } });
  if (!branch) throw new AppError("not_found", {}, 404);
  if (branch.status !== "ACTIVE") throw new AppError("branch_inactive");

  const productIds = [...new Set(lines.map((l) => l.productId))].sort();
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { units: true },
  });
  if (products.length !== productIds.length) throw new AppError("product_not_found", {}, 404);
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Make sure every (branch, product) row exists, then lock them in a stable order.
  await tx.$executeRaw`
    INSERT INTO branch_inventory (id, branch_id, product_id, updated_at)
    SELECT 'inv_' || md5(${branchId} || ':' || pid), ${branchId}, pid, NOW()
    FROM unnest(${productIds}::text[]) AS pid
    ON CONFLICT (branch_id, product_id) DO NOTHING`;

  const locked = await tx.$queryRaw<LockedRow[]>`
    SELECT id, product_id, quantity, reserved FROM branch_inventory
    WHERE branch_id = ${branchId} AND product_id = ANY(${productIds}::text[])
    ORDER BY product_id
    FOR UPDATE`;
  const balances = new Map(
    locked.map((r) => [r.product_id, { id: r.id, qty: num(r.quantity), reserved: num(r.reserved) }]),
  );

  const created: InventoryTransaction[] = [];
  const now = new Date();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const product = productMap.get(line.productId)!;
    const bal = balances.get(line.productId)!;

    if (!Number.isFinite(line.quantity) || line.quantity === 0) throw new AppError("quantity_invalid");
    if (TX_DIRECTION[line.type] !== null && line.quantity < 0) throw new AppError("quantity_invalid");
    const isUserOutflow = ["CONSUMPTION", "WITHDRAWAL"].includes(line.type);
    if (isUserOutflow && product.status !== "ACTIVE") throw new AppError("product_inactive");

    const unit = line.unit ?? product.baseUnit;
    let factor = 1;
    if (unit !== product.baseUnit) {
      const pu = product.units.find((u) => u.unit === unit);
      if (!pu) throw new AppError("unit_not_supported", { unit });
      factor = num(pu.factor);
    }

    const delta = signedDelta(line.type, line.quantity, factor);
    const prev = bal.qty;
    const next = q3(prev + delta);
    const availAfter = availOf(next, bal.reserved);

    if (delta < 0 && availAfter < 0 && !settings.allowNegativeStock && !opts.allowNegative) {
      throw new AppError("insufficient_stock", {
        product: product.nameAr || product.name,
        available: availOf(prev, bal.reserved),
      });
    }

    const row = await tx.inventoryTransaction.create({
      data: {
        branchId,
        productId: product.id,
        inventoryId: bal.id,
        type: line.type,
        quantity: delta,
        enteredQuantity: line.quantity,
        enteredUnit: unit,
        unitFactor: factor,
        previousQty: prev,
        newQty: next,
        unitCost: line.unitCost ?? num(product.costPrice),
        userId: actor.id,
        reason: line.reason?.slice(0, 500) ?? null,
        notes: line.notes?.slice(0, 2000) ?? null,
        idempotencyKey: lineKey(opts.idempotencyKey, i, lines.length),
        replenishmentId: line.replenishmentId ?? null,
        receiptId: line.receiptId ?? null,
        transferId: line.transferId ?? null,
        countId: line.countId ?? null,
        adjustmentId: line.adjustmentId ?? null,
        attachmentId: line.attachmentId ?? null,
        createdAt: now,
      },
    });
    bal.qty = next;
    created.push(row);
  }

  // Persist balances, refresh consumption averages, evaluate alerts.
  const consumed = new Set(
    lines.filter((l) => CONSUMPTION_TYPES.includes(l.type) || l.type === "RETURN").map((l) => l.productId),
  );
  for (const pid of productIds) {
    const bal = balances.get(pid)!;
    const data: Prisma.BranchInventoryUpdateInput = { quantity: bal.qty, lastMovementAt: now };
    if (consumed.has(pid)) data.avgDailyConsumption = await averageDailyConsumption(tx, bal.id, settings.consumptionWindowDays);
    await tx.branchInventory.update({ where: { id: bal.id }, data });
    await evaluateAlert(tx, bal.id, actor);
  }

  return created;
}

/** (consumption + withdrawal − returns) over the window, per day. */
export async function averageDailyConsumption(tx: Tx, inventoryId: string, windowDays: number): Promise<number> {
  const rows = await tx.$queryRaw<{ total: Prisma.Decimal | null }[]>`
    SELECT SUM(-quantity) AS total
    FROM inventory_transactions
    WHERE inventory_id = ${inventoryId}
      AND type IN ('CONSUMPTION', 'WITHDRAWAL', 'RETURN')
      AND created_at >= NOW() - make_interval(days => ${windowDays}::int)`;
  const total = Math.max(0, num(rows[0]?.total));
  return q3(total / Math.max(1, windowDays));
}
