import { beforeEach, describe, expect, it } from "vitest";
import { postMovements } from "@/server/inventory/ledger";
import { recordMovement } from "@/server/movements";
import { createRequest, getRequest, listRequests, approveRequest } from "@/server/replenishment";
import { createTransfer, getTransfer } from "@/server/transfers";
import { listAlerts } from "@/server/alerts";
import { listInventory } from "@/server/inventory/queries";
import { key, makeBranch, makeProduct, makeUser, qty, resetDb, setThresholds } from "./helpers";

describe("branch isolation and permissions", () => {
  beforeEach(resetDb);

  it("managers only see and act on their branches", async () => {
    const a = await makeBranch();
    const c = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    const mgrA = await makeUser("MANAGER", [a.id]);
    await setThresholds(c.id, p.id, { min: 10 });
    await postMovements(owner, { branchId: c.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 3 }] });
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 30 }] });

    const inv = await listInventory(mgrA, {});
    expect(inv.rows.every((r) => r.branchId === a.id)).toBe(true);
    await expect(listInventory(mgrA, { branchId: c.id })).rejects.toMatchObject({ code: "not_found" });

    expect((await listAlerts(mgrA, {})).total).toBe(0);
    expect((await listAlerts(owner, {})).total).toBe(1);

    const reqC = await createRequest(owner, { branchId: c.id, items: [{ productId: p.id, quantity: 5 }] });
    await expect(getRequest(mgrA, reqC.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(approveRequest(mgrA, reqC.id)).rejects.toMatchObject({ code: "not_found" });
    expect((await listRequests(mgrA)).rows.some((r) => r.id === reqC.id)).toBe(false);
    await expect(createRequest(mgrA, { branchId: c.id, items: [{ productId: p.id, quantity: 1 }] })).rejects.toMatchObject({ code: "not_found" });
    await expect(postMovementsAs(mgrA, c.id, p.id)).rejects.toMatchObject({ code: "not_found" });

    const d = await makeBranch();
    const tr = await createTransfer(owner, { sourceBranchId: c.id, destinationBranchId: d.id, items: [{ productId: p.id, quantity: 1 }] });
    await expect(getTransfer(mgrA, tr.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("employees record only in their own branch and only allowed movement types", async () => {
    const a = await makeBranch();
    const c = await makeBranch();
    const p = await makeProduct();
    const owner = await makeUser("OWNER");
    await postMovements(owner, { branchId: a.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 10 }] });
    await postMovements(owner, { branchId: c.id, lines: [{ productId: p.id, type: "INITIAL_STOCK", quantity: 10 }] });
    const emp = await makeUser("EMPLOYEE", [a.id]);
    // A forged branch id is ignored: employees always post to their own branch.
    await recordMovement(emp, { branchId: c.id, productId: p.id, type: "CONSUMPTION", quantity: 1, idempotencyKey: key() });
    expect(await qty(a.id, p.id)).toBe(9);
    expect(await qty(c.id, p.id)).toBe(10);
    await expect(recordMovement(emp, { productId: p.id, type: "STOCK_RECEIPT", quantity: 100, idempotencyKey: key() })).rejects.toMatchObject({ code: "forbidden" });
    await expect(recordMovement(emp, { productId: p.id, type: "ADJUSTMENT", quantity: 100, idempotencyKey: key() })).rejects.toMatchObject({ code: "type_not_allowed" });
    await expect(createRequest(emp, { branchId: a.id, items: [{ productId: p.id, quantity: 1 }] })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("suppliers cannot use staff services", async () => {
    const a = await makeBranch();
    const sup = await makeUser("SUPPLIER");
    await expect(listInventory(sup, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(listRequests(sup)).rejects.toMatchObject({ code: "forbidden" });
    void a;
  });
});

async function postMovementsAs(actor: Awaited<ReturnType<typeof makeUser>>, branchId: string, productId: string) {
  return recordMovement(actor, { branchId, productId, type: "STOCK_RECEIPT", quantity: 1, idempotencyKey: key() });
}
