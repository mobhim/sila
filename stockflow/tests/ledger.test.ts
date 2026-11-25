import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postMovements } from "@/server/inventory/ledger";
import { recordMovement } from "@/server/movements";
import { key, makeBranch, makeProduct, makeUser, qty, resetDb } from "./helpers";

describe("inventory ledger", () => {
  beforeEach(resetDb);

  it("records every movement with previous and new quantity", async () => {
    const b = await makeBranch();
    const p = await makeProduct({ cartonOf: 12 });
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 2, unit: "CARTON" }] });
    expect(await qty(b.id, p.id)).toBe(24);
    const emp = await makeUser("EMPLOYEE", [b.id]);
    const r = await recordMovement(emp, { productId: p.id, type: "CONSUMPTION", quantity: 5, idempotencyKey: key() });
    expect(Number(r.transaction.previousQty)).toBe(24);
    expect(Number(r.transaction.newQty)).toBe(19);
    expect(Number(r.transaction.quantity)).toBe(-5);
    expect(r.transaction.userId).toBe(emp.id);
    expect(r.transaction.branchId).toBe(b.id);
    const txs = await db.inventoryTransaction.findMany({ where: { productId: p.id } });
    expect(txs.reduce((s, t) => s + Number(t.quantity), 0)).toBe(19);
  });

  it("rejects negative stock unless enabled", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 3 }] });
    await expect(postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 4 }] })).rejects.toMatchObject({ code: "insufficient_stock" });
    expect(await qty(b.id, p.id)).toBe(3);
    await db.settings.update({ where: { id: 1 }, data: { allowNegativeStock: true } });
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 4 }] });
    expect(await qty(b.id, p.id)).toBe(-1);
  });

  it("is idempotent: replaying a key does not deduct twice", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 10 }] });
    const emp = await makeUser("EMPLOYEE", [b.id]);
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => recordMovement(emp, { productId: p.id, type: "CONSUMPTION", quantity: 2, idempotencyKey: k })),
    );
    expect(await qty(b.id, p.id)).toBe(8);
    expect(new Set(results.map((r) => r.transaction.id)).size).toBe(1);
    expect(results.filter((r) => r.replayed).length).toBe(4);
  });

  it("serialises concurrent movements without losing updates or going negative", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 10 }] });
    const emp = await makeUser("EMPLOYEE", [b.id]);
    const settled = await Promise.allSettled(
      Array.from({ length: 15 }, () => recordMovement(emp, { productId: p.id, type: "CONSUMPTION", quantity: 1, idempotencyKey: key() })),
    );
    expect(settled.filter((s) => s.status === "fulfilled").length).toBe(10);
    expect(settled.filter((s) => s.status === "rejected").every((s) => (s as PromiseRejectedResult).reason.code === "insufficient_stock")).toBe(true);
    expect(await qty(b.id, p.id)).toBe(0);
    const txs = await db.inventoryTransaction.findMany({ where: { productId: p.id }, orderBy: { seq: "asc" } });
    // The chain of previous → new quantities is continuous.
    for (let i = 1; i < txs.length; i++) expect(Number(txs[i].previousQty)).toBe(Number(txs[i - 1].newQty));
  });

  it("keeps branches independent", async () => {
    const a = await makeBranch();
    const c = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 10 }] });
    await postMovements(owner, { branchId: c.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 3 }] });
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 4 }] });
    expect(await qty(a.id, p.id)).toBe(6);
    expect(await qty(c.id, p.id)).toBe(3);
  });

  it("the ledger is append-only at the database level", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    const { transactions } = await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 1 }] });
    await expect(db.inventoryTransaction.update({ where: { id: transactions[0].id }, data: { notes: "x" } })).rejects.toThrow();
    await expect(db.inventoryTransaction.delete({ where: { id: transactions[0].id } })).rejects.toThrow();
  });

  it("updates average daily consumption", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 100 }] });
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 30 }, { productId: p.id, type: "WITHDRAWAL", quantity: 30 }] });
    const inv = await db.branchInventory.findUniqueOrThrow({ where: { branchId_productId: { branchId: b.id, productId: p.id } } });
    expect(Number(inv.avgDailyConsumption)).toBe(2); // 60 / 30 days
    expect(Number(inv.quantity)).toBe(40);
  });
});
