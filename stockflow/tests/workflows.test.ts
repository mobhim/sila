import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postMovements } from "@/server/inventory/ledger";
import { recordMovement } from "@/server/movements";
import {
  approveRequest, cancelRequest, createRequest, getRequest, listForSupplier, receiveRequest, sendToSupplier, supplierRespond, supplierUpdate,
} from "@/server/replenishment";
import { approveTransfer, createTransfer, dispatchTransfer, receiveTransfer, closeTransfer } from "@/server/transfers";
import { approveCount, createCount, enterCounts, submitCount } from "@/server/counts";
import { requestAdjustment, reviewAdjustment } from "@/server/adjustments";
import { key, makeBranch, makeProduct, makeSupplier, makeUser, qty, resetDb, setThresholds } from "./helpers";

async function stocked(initial: number, t: { min: number; reorder?: number; max?: number }) {
  const b = await makeBranch();
  const s = await makeSupplier(3);
  const p = await makeProduct({ supplierId: s.id });
  const owner = await makeUser("OWNER");
  await setThresholds(b.id, p.id, t);
  await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: initial }] });
  return { b, s, p, owner };
}

describe("low-stock alerts", () => {
  beforeEach(resetDb);

  it("opens one alert, escalates, resolves on replenishment and re-opens on the next drop", async () => {
    const { b, p, owner } = await stocked(20, { min: 10, max: 30 });
    expect(await db.stockAlert.count()).toBe(0);
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 10 }] });
    let alerts = await db.stockAlert.findMany();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("LOW");
    // Still low: no duplicate.
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 1 }] });
    expect(await db.stockAlert.count()).toBe(1);
    // Escalate to critical, then out.
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 4 }] });
    alerts = await db.stockAlert.findMany();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].level).toBe("CRITICAL");
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 5 }] });
    expect((await db.stockAlert.findFirstOrThrow()).level).toBe("OUT_OF_STOCK");
    // Notifications: open + 2 escalations, for the owner.
    expect(await db.notification.count({ where: { userId: owner.id, type: "stock_alert" } })).toBe(3);
    // Receipt resolves it.
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "STOCK_RECEIPT", quantity: 25 }] });
    expect((await db.stockAlert.findFirstOrThrow()).status).toBe("RESOLVED");
    // Dropping again opens a new one.
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "CONSUMPTION", quantity: 20 }] });
    expect(await db.stockAlert.count()).toBe(2);
    expect(await db.stockAlert.count({ where: { status: { not: "RESOLVED" } } })).toBe(1);
  });

  it("creates one auto draft per branch and supplier, without duplicate products", async () => {
    const { b, s, owner } = await stocked(20, { min: 10, max: 30 });
    const p2 = await makeProduct({ supplierId: s.id });
    await setThresholds(b.id, p2.id, { min: 5, max: 20 });
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p2.id, type: "INITIAL_STOCK", quantity: 10 }] });
    const p1 = (await db.branchInventory.findFirstOrThrow({ where: { branchId: b.id, minStock: 10 } })).productId;
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p1, type: "CONSUMPTION", quantity: 12 }, { productId: p2.id, type: "CONSUMPTION", quantity: 6 }] });
    const drafts = await db.replenishmentRequest.findMany({ include: { items: true } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("DRAFT");
    expect(drafts[0].source).toBe("AUTO");
    expect(drafts[0].supplierId).toBe(s.id);
    expect(drafts[0].items).toHaveLength(2);
    expect(Number(drafts[0].items.find((i) => i.productId === p1)!.recommendedQty)).toBe(22); // 30 − 8
    // Resolve and drop again while the draft is still open: no second line for the product.
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p1, type: "STOCK_RECEIPT", quantity: 10 }] });
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p1, type: "CONSUMPTION", quantity: 10 }] });
    expect(await db.replenishmentRequestItem.count()).toBe(2);
  });
});

describe("replenishment workflow", () => {
  beforeEach(resetDb);

  it("runs draft → approval → supplier → partial and full receipt", async () => {
    const { b, s, p, owner } = await stocked(2, { min: 10, max: 30 });
    const manager = await makeUser("MANAGER", [b.id]);
    const supplierUser = await makeUser("SUPPLIER", [], s.id);
    const otherSupplier = await makeUser("SUPPLIER", [], (await makeSupplier()).id);
    // Initial stock of 2 is below min → alert + auto draft.
    const draft = await db.replenishmentRequest.findFirstOrThrow({ include: { items: true } });
    // Supplier sees nothing before it is sent.
    expect(await listForSupplier(supplierUser)).toHaveLength(0);
    await approveRequest(manager, draft.id);
    expect((await db.stockAlert.findFirstOrThrow()).status).toBe("REPLENISHMENT_PENDING");
    await sendToSupplier(manager, draft.id);
    expect(await listForSupplier(supplierUser)).toHaveLength(1);
    expect(await listForSupplier(otherSupplier)).toHaveLength(0);
    await expect(getRequest(otherSupplier, draft.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await db.notification.count({ where: { userId: supplierUser.id } })).toBe(1);

    await supplierRespond(supplierUser, draft.id, true, "OK", new Date(Date.now() + 86400000));
    await supplierUpdate(supplierUser, draft.id, { inTransit: true, confirmed: [{ itemId: draft.items[0].id, quantity: 28 }] });
    expect((await db.replenishmentRequest.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("IN_TRANSIT");

    const requested = Number(draft.items[0].requestedQty);
    expect(requested).toBe(28);
    await expect(receiveRequest(manager, draft.id, { lines: [{ itemId: draft.items[0].id, quantity: requested + 1 }], idempotencyKey: key() })).rejects.toMatchObject({ code: "over_receipt" });

    const k = key();
    await receiveRequest(manager, draft.id, { lines: [{ itemId: draft.items[0].id, quantity: 10 }], idempotencyKey: k });
    const replay = await receiveRequest(manager, draft.id, { lines: [{ itemId: draft.items[0].id, quantity: 10 }], idempotencyKey: k });
    expect(replay.replayed).toBe(true);
    expect(await qty(b.id, p.id)).toBe(12);
    let r = await db.replenishmentRequest.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
    expect(r.status).toBe("PARTIALLY_RECEIVED");
    expect(Number(r.items[0].receivedQty)).toBe(10);
    // Stock is above minimum, so the alert resolved.
    expect((await db.stockAlert.findFirstOrThrow()).status).toBe("RESOLVED");

    await receiveRequest(manager, draft.id, { lines: [{ itemId: draft.items[0].id, quantity: 18 }], idempotencyKey: key() });
    r = await db.replenishmentRequest.findUniqueOrThrow({ where: { id: draft.id }, include: { items: true } });
    expect(r.status).toBe("RECEIVED");
    expect(await qty(b.id, p.id)).toBe(30);
    const receipts = await db.inventoryTransaction.findMany({ where: { replenishmentId: draft.id } });
    expect(receipts.map((t) => Number(t.quantity))).toEqual([10, 18]);
    void owner;
  });

  it("requires approval before sending and a supplier to send", async () => {
    const b = await makeBranch({ autoDraftReplenishment: false });
    const p = await makeProduct();
    const manager = await makeUser("MANAGER", [b.id]);
    const req = await createRequest(manager, { branchId: b.id, items: [{ productId: p.id, quantity: 5 }] });
    await expect(sendToSupplier(manager, req.id)).rejects.toMatchObject({ code: "invalid_transition" });
    await approveRequest(manager, req.id);
    await expect(sendToSupplier(manager, req.id)).rejects.toMatchObject({ code: "supplier_required" });
    await cancelRequest(manager, req.id, "not needed");
    expect((await db.replenishmentRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("CANCELLED");
  });

  it("automated purchasing policy approves and sends when enabled", async () => {
    await db.settings.update({ where: { id: 1 }, data: { autoApproveReplenishment: true } });
    await stocked(2, { min: 10, max: 30 });
    const r = await db.replenishmentRequest.findFirstOrThrow();
    expect(r.status).toBe("SENT_TO_SUPPLIER");
  });
});

describe("branch transfers", () => {
  beforeEach(resetDb);

  it("moves stock only on dispatch and receipt, with partial receipt", async () => {
    const a = await makeBranch({ autoDraftReplenishment: false });
    const c = await makeBranch({ autoDraftReplenishment: false });
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 20 }] });
    const t = await createTransfer(owner, { sourceBranchId: a.id, destinationBranchId: c.id, items: [{ productId: p.id, quantity: 8 }] });
    await approveTransfer(owner, t.id);
    expect(await qty(a.id, p.id)).toBe(20);
    const k = key();
    await dispatchTransfer(owner, t.id, { idempotencyKey: k });
    expect((await dispatchTransfer(owner, t.id, { idempotencyKey: k })).replayed).toBe(true);
    await expect(dispatchTransfer(owner, t.id, { idempotencyKey: key() })).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await qty(a.id, p.id)).toBe(12);
    expect(await qty(c.id, p.id)).toBe(0);
    const item = (await db.inventoryTransferItem.findFirstOrThrow()).id;
    await receiveTransfer(owner, t.id, { lines: [{ itemId: item, quantity: 5 }], idempotencyKey: key() });
    expect(await qty(c.id, p.id)).toBe(5);
    expect((await db.inventoryTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("PARTIALLY_RECEIVED");
    await closeTransfer(owner, t.id, "3 broken in transit");
    expect((await db.inventoryTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("COMPLETED");
  });

  it("cannot dispatch more than the source has", async () => {
    const a = await makeBranch();
    const c = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 2 }] });
    const t = await createTransfer(owner, { sourceBranchId: a.id, destinationBranchId: c.id, items: [{ productId: p.id, quantity: 5 }] });
    await approveTransfer(owner, t.id);
    await expect(dispatchTransfer(owner, t.id, { idempotencyKey: key() })).rejects.toMatchObject({ code: "insufficient_stock" });
    expect(await qty(a.id, p.id)).toBe(2);
    expect((await db.inventoryTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("APPROVED");
  });
});

describe("counts and adjustments", () => {
  beforeEach(resetDb);

  it("applies count variance on top of movements made during the count", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    const emp = await makeUser("EMPLOYEE", [b.id]);
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 50 }] });
    const c = await createCount(owner, { branchId: b.id, productIds: [p.id] });
    const item = await db.inventoryCountItem.findFirstOrThrow({ where: { countId: c.id } });
    await enterCounts(emp, c.id, [{ itemId: item.id, countedQty: 47 }]);
    // Consumption after counting.
    await recordMovement(emp, { productId: p.id, type: "CONSUMPTION", quantity: 5, idempotencyKey: key() });
    await expect(submitCount(owner, c.id)).rejects.toMatchObject({ code: "variance_reason_required" });
    await enterCounts(emp, c.id, [{ itemId: item.id, countedQty: 47, reason: "breakage" }]);
    await submitCount(owner, c.id);
    await approveCount(owner, c.id);
    expect(await qty(b.id, p.id)).toBe(42); // 50 − 5 − 3
    const corr = await db.inventoryTransaction.findFirstOrThrow({ where: { type: "COUNT_CORRECTION" } });
    expect(Number(corr.quantity)).toBe(-3);
  });

  it("employee damage reports wait for approval", async () => {
    const b = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    const emp = await makeUser("EMPLOYEE", [b.id]);
    const mgr = await makeUser("MANAGER", [b.id]);
    await postMovements(owner, { branchId: b.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 10 }] });
    const r = await requestAdjustment(emp, { productId: p.id, kind: "DAMAGED", quantity: 2, reason: "dropped" });
    expect(r.autoApproved).toBe(false);
    expect(await qty(b.id, p.id)).toBe(10);
    expect(await db.notification.count({ where: { userId: mgr.id, type: "adjustment" } })).toBe(1);
    await reviewAdjustment(mgr, r.id!, true, "ok");
    expect(await qty(b.id, p.id)).toBe(8);
    await expect(reviewAdjustment(mgr, r.id!, true)).rejects.toMatchObject({ code: "already_reviewed" });
    const self = await requestAdjustment(mgr, { productId: p.id, kind: "CORRECTION", quantity: 1, reason: "found one" });
    expect(self.autoApproved).toBe(true);
    expect(await qty(b.id, p.id)).toBe(9);
  });
});
