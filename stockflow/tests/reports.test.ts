import { beforeEach, describe, expect, it } from "vitest";
import { postMovements } from "@/server/inventory/ledger";
import { REPORT_TYPES, runReport, toCsv } from "@/server/reports";
import { getDashboard } from "@/server/dashboard";
import { compareInventory, listInventory } from "@/server/inventory/queries";
import { makeBranch, makeProduct, makeSupplier, makeUser, resetDb, setThresholds } from "./helpers";

describe("reports and dashboard", () => {
  beforeEach(resetDb);

  it("compute from real ledger data", async () => {
    const a = await makeBranch();
    const b = await makeBranch();
    const s = await makeSupplier();
    const p = await makeProduct({ supplierId: s.id, cost: 5 });
    const owner = await makeUser("OWNER");
    await setThresholds(a.id, p.id, { min: 10, max: 50 });
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 40 }] });
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 7 }] });
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 32 }] });

    const range = { from: new Date(Date.now() - 86400000), to: new Date(Date.now() + 86400000) };
    for (const type of REPORT_TYPES) {
      const r = await runReport(owner, type, range);
      expect(Array.isArray(r.rows)).toBe(true);
      expect(toCsv(r, (k) => k, (_c, v) => String(v ?? "")).startsWith("﻿")).toBe(true);
    }
    const val = await runReport(owner, "valuation", range);
    expect(val.totals?.value).toBe((8 + 7) * 5);
    const cons = await runReport(owner, "consumption", range);
    expect(cons.rows[0].net).toBe(32);

    const d = await getDashboard(owner);
    expect(d.kpi.totalValue).toBe(75);
    expect(d.kpi.low).toBe(1);
    expect(d.kpi.critical).toBe(0);
    expect(d.kpi.consumptionTodayQty).toBe(32);
    expect(d.kpi.pendingRequests).toBe(1); // auto draft
    expect(d.trend.length).toBe(30);
    expect(d.comparison.length).toBe(2);

    const inv = await listInventory(owner, { state: "ATTENTION" });
    expect(inv.total).toBe(1);
    const cmp = await compareInventory(owner, {});
    expect(Object.keys(cmp.products[0].cells)).toHaveLength(2);
  });
});
