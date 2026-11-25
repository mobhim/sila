import { describe, expect, it } from "vitest";
import { daysRemaining, recommendReorder, signedDelta, stockState } from "@/server/inventory/calc";

describe("stock calculations", () => {
  it("derives stock state from thresholds", () => {
    expect(stockState(0, 10, null, 50)).toBe("OUT_OF_STOCK");
    expect(stockState(-2, 0, null, 50)).toBe("OUT_OF_STOCK");
    expect(stockState(5, 10, null, 50)).toBe("CRITICAL");
    expect(stockState(6, 10, null, 50)).toBe("LOW");
    expect(stockState(10, 10, null, 50)).toBe("LOW");
    expect(stockState(11, 10, null, 50)).toBe("NORMAL");
    expect(stockState(3, 10, 2, 50)).toBe("LOW");
    expect(stockState(50, 0, null, 50)).toBe("NORMAL");
  });

  it("signs quantities by type and converts units", () => {
    expect(signedDelta("CONSUMPTION", 2, 12)).toBe(-24);
    expect(signedDelta("PURCHASE_RECEIPT", 1.5, 1)).toBe(1.5);
    expect(signedDelta("ADJUSTMENT", -3, 1)).toBe(-3);
    expect(signedDelta("COUNT_CORRECTION", 4, 1)).toBe(4);
  });

  it("days remaining", () => {
    expect(daysRemaining(10, 0)).toBeNull();
    expect(daysRemaining(10, 4)).toBe(2.5);
  });

  it("recommends a reorder quantity covering lead time, safety stock and target", () => {
    const base = { available: 4, onOrder: 0, minStock: 10, reorderQty: 0, maxStock: 40, safetyStock: 0, avgDailyConsumption: 2, leadTimeDays: 3, reviewPeriodDays: 7, safetyDays: 2, orderMultiple: 1 };
    const r = recommendReorder(base);
    expect(r.safety).toBe(4);
    expect(r.cover).toBe(24); // 2 × (3 + 7) + 4
    expect(r.target).toBe(40);
    expect(r.recommended).toBe(36); // 40 − 4
    // High consumption makes cover exceed target.
    expect(recommendReorder({ ...base, avgDailyConsumption: 5 }).recommended).toBe(5 * 10 + 10 - 4);
    // On-order quantity is subtracted.
    expect(recommendReorder({ ...base, onOrder: 30 }).recommended).toBe(6);
    // Order multiple rounds up (cartons of 12).
    expect(recommendReorder({ ...base, orderMultiple: 12 }).recommended).toBe(36);
    expect(recommendReorder({ ...base, available: 5, orderMultiple: 12 }).recommended).toBe(36);
    // Minimum order quantity.
    expect(recommendReorder({ ...base, maxStock: 0, reorderQty: 20, avgDailyConsumption: 0 }).recommended).toBe(26);
    // Nothing needed.
    expect(recommendReorder({ ...base, available: 100 }).recommended).toBe(0);
  });
});
