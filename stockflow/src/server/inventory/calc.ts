/**
 * Pure inventory calculations. No database access, so they are unit-tested directly and
 * shared by the ledger, the alert engine, reports and the UI.
 */
import type { TxType } from "@prisma/client";
import { q3 } from "@/lib/num";

export type StockState = "NORMAL" | "LOW" | "CRITICAL" | "OUT_OF_STOCK";

/** Direction of each transaction type. `null` means the sign comes from the caller. */
export const TX_DIRECTION: Record<TxType, 1 | -1 | null> = {
  INITIAL_STOCK: 1,
  CONSUMPTION: -1,
  WITHDRAWAL: -1,
  STOCK_RECEIPT: 1,
  PURCHASE_RECEIPT: 1,
  RETURN: 1,
  DAMAGED: -1,
  EXPIRED: -1,
  TRANSFER_OUT: -1,
  TRANSFER_IN: 1,
  ADJUSTMENT: null,
  COUNT_CORRECTION: null,
};

/** Transaction types counted as consumption for the daily-consumption average. */
export const CONSUMPTION_TYPES: TxType[] = ["CONSUMPTION", "WITHDRAWAL"];

/** Convert an entered quantity to a signed base-unit delta. */
export function signedDelta(type: TxType, enteredQty: number, factor: number): number {
  const base = q3(enteredQty * factor);
  const dir = TX_DIRECTION[type];
  if (dir === null) return base; // caller supplies the sign
  return q3(Math.abs(base) * dir);
}

export function available(quantity: number, reserved: number): number {
  return q3(quantity - reserved);
}

export function criticalLevel(minStock: number, criticalStock: number | null, criticalPercent: number): number {
  if (criticalStock !== null && criticalStock !== undefined) return criticalStock;
  return q3((minStock * criticalPercent) / 100);
}

export function stockState(
  avail: number,
  minStock: number,
  criticalStock: number | null,
  criticalPercent: number,
): StockState {
  if (avail <= 0) return "OUT_OF_STOCK";
  if (minStock <= 0) return "NORMAL";
  if (avail <= criticalLevel(minStock, criticalStock, criticalPercent)) return "CRITICAL";
  if (avail <= minStock) return "LOW";
  return "NORMAL";
}

/** Whether a row is monitored by the alert engine. */
export function isMonitored(minStock: number): boolean {
  return minStock > 0;
}

export function daysRemaining(avail: number, adc: number): number | null {
  if (adc <= 0) return null;
  return Math.max(0, Math.floor((avail / adc) * 10) / 10);
}

export interface ReorderInput {
  available: number;
  onOrder: number;
  minStock: number;
  reorderQty: number;
  maxStock: number;
  safetyStock: number;
  avgDailyConsumption: number;
  leadTimeDays: number;
  reviewPeriodDays: number;
  safetyDays: number;
  /** Base units per order unit (e.g. 12 for a carton of 12). 1 when none. */
  orderMultiple: number;
}

export interface ReorderResult {
  recommended: number;
  safety: number;
  cover: number;
  target: number;
  needed: number;
  input: ReorderInput;
}

/**
 * Recommended replenishment quantity (base units). See docs/ARCHITECTURE.md §5.
 */
export function recommendReorder(i: ReorderInput): ReorderResult {
  const safety = i.safetyStock > 0 ? i.safetyStock : q3(i.avgDailyConsumption * i.safetyDays);
  const cover = q3(i.avgDailyConsumption * (i.leadTimeDays + i.reviewPeriodDays) + safety);
  const target = i.maxStock > 0 ? i.maxStock : q3(i.minStock + i.reorderQty);
  // Always aim at least one unit above the minimum so the alert clears on receipt.
  const floor = i.minStock > 0 ? q3(i.minStock + 1) : 0;
  const needed = Math.max(target, cover, floor);
  let rec = q3(needed - i.available - i.onOrder);
  if (rec > 0 && i.reorderQty > 0) rec = Math.max(rec, i.reorderQty);
  if (rec > 0 && i.orderMultiple > 1) rec = Math.ceil(rec / i.orderMultiple) * i.orderMultiple;
  if (rec < 0) rec = 0;
  return { recommended: q3(rec), safety, cover, target, needed: q3(needed), input: i };
}
