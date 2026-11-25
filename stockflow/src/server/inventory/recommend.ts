import type { BranchInventory, Product, ProductUnit, Settings, Supplier } from "@prisma/client";
import { Prisma, type Tx } from "../db";
import { num } from "@/lib/num";
import { available, recommendReorder, type ReorderResult } from "./calc";

export const OPEN_REQUEST_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT_TO_SUPPLIER",
  "ACCEPTED",
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
] as const;

/** Statuses whose quantities count as "on order" (approved and not yet fully received). */
export const ON_ORDER_STATUSES = ["APPROVED", "SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] as const;

export async function onOrderQty(tx: Tx, branchId: string, productId: string, excludeRequestId?: string): Promise<number> {
  const rows = await tx.$queryRaw<{ q: Prisma.Decimal | null }[]>`
    SELECT SUM(GREATEST(i.requested_qty - i.received_qty, 0)) AS q
    FROM replenishment_request_items i
    JOIN replenishment_requests r ON r.id = i.request_id
    WHERE r.branch_id = ${branchId} AND i.product_id = ${productId}
      AND r.status::text = ANY(${[...ON_ORDER_STATUSES]}::text[])
      AND r.id <> ${excludeRequestId ?? ""}`;
  return num(rows[0]?.q);
}

type InvWithProduct = BranchInventory & {
  product: Product & { units: ProductUnit[]; supplier: Supplier | null };
};

export function orderMultiple(units: ProductUnit[]): number {
  const u = units.find((x) => x.isOrderUnit);
  return u ? num(u.factor) : 1;
}

export async function recommendationFor(
  tx: Tx,
  inv: InvWithProduct,
  reviewPeriodDays: number,
  settings: Settings,
  opts: { excludeRequestId?: string; supplier?: Supplier | null } = {},
): Promise<ReorderResult> {
  const supplier = opts.supplier !== undefined ? opts.supplier : inv.product.supplier;
  return recommendReorder({
    available: available(num(inv.quantity), num(inv.reserved)),
    onOrder: await onOrderQty(tx, inv.branchId, inv.productId, opts.excludeRequestId),
    minStock: num(inv.minStock),
    reorderQty: num(inv.reorderQty),
    maxStock: num(inv.maxStock),
    safetyStock: num(inv.safetyStock),
    avgDailyConsumption: num(inv.avgDailyConsumption),
    leadTimeDays: supplier?.leadTimeDays ?? 3,
    reviewPeriodDays,
    safetyDays: settings.safetyDays,
    orderMultiple: orderMultiple(inv.product.units),
  });
}
