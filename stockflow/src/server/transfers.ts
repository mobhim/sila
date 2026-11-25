/**
 * Branch-to-branch transfers. Stock leaves the source only at dispatch and enters the
 * destination only at receipt.
 */
import type { TransferStatus, Prisma as P } from "@prisma/client";
import { db, withTx, type Tx } from "./db";
import { AppError, isUniqueViolation, notFound } from "./errors";
import { hasBranchAccess, assertBranchAccess, branchScope, requirePermission, type Actor } from "./rbac";
import { audit } from "./audit";
import { recordEvent } from "./workflow";
import { postMovements } from "./inventory/ledger";
import { branchSupervisors, notify } from "./notifications";
import { statusLabel } from "./notifications/messages";
import { num, q3 } from "@/lib/num";

const ENTITY = "transfer";

const TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  REQUESTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["PARTIALLY_RECEIVED", "COMPLETED"],
  PARTIALLY_RECEIVED: ["PARTIALLY_RECEIVED", "COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

async function lock(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM inventory_transfers WHERE id = ${id} FOR UPDATE`;
  const t = await tx.inventoryTransfer.findUnique({ where: { id }, include: { items: true, source: true, destination: true } });
  if (!t) throw notFound();
  return t;
}

type Locked = Awaited<ReturnType<typeof lock>>;

function assertParticipant(actor: Actor, t: { sourceBranchId: string; destinationBranchId: string }) {
  if (!hasBranchAccess(actor, t.sourceBranchId) && !hasBranchAccess(actor, t.destinationBranchId)) throw notFound();
}

async function move(tx: Tx, t: Locked, to: TransferStatus, actor: Actor, data: P.InventoryTransferUpdateInput = {}, note?: string | null) {
  if (!TRANSITIONS[t.status].includes(to)) throw new AppError("invalid_transition", { from: t.status, to });
  await tx.inventoryTransfer.update({ where: { id: t.id }, data: { ...data, status: to } });
  await recordEvent(tx, { entityType: ENTITY, entityId: t.id, from: t.status, to, userId: actor.id, note });
  for (const locale of ["ar", "en"] as const) {
    const ids = await branchSupervisors(tx, [t.sourceBranchId, t.destinationBranchId]);
    const users = await tx.user.findMany({ where: { id: { in: ids.filter((i) => i !== actor.id) }, locale }, select: { id: true } });
    if (!users.length) continue;
    await notify(tx, {
      userIds: users.map((u) => u.id),
      type: "transfer",
      key: "transfer.status",
      params: {
        no: t.seq,
        status: statusLabel(to, locale),
        from: t.source.nameAr || t.source.name,
        to: t.destination.nameAr || t.destination.name,
      },
      link: `/transfers/${t.id}`,
      severity: to === "CANCELLED" ? "warning" : "info",
    });
  }
}

export async function listTransfers(actor: Actor, f: { branchId?: string; status?: TransferStatus | "OPEN"; page?: number } = {}) {
  requirePermission(actor, "transfers.view");
  const scope = branchScope(actor);
  if (f.branchId) assertBranchAccess(actor, f.branchId);
  const ids = f.branchId ? [f.branchId] : scope;
  const where: P.InventoryTransferWhereInput = {
    ...(ids === "ALL" ? {} : { OR: [{ sourceBranchId: { in: ids } }, { destinationBranchId: { in: ids } }] }),
    ...(f.status === "OPEN"
      ? { status: { in: ["REQUESTED", "APPROVED", "DISPATCHED", "PARTIALLY_RECEIVED"] } }
      : f.status
        ? { status: f.status }
        : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const pageSize = 30;
  const [rows, total] = await Promise.all([
    db.inventoryTransfer.findMany({
      where,
      include: {
        source: { select: { id: true, name: true, nameAr: true, code: true } },
        destination: { select: { id: true, name: true, nameAr: true, code: true } },
        items: { select: { requestedQty: true, dispatchedQty: true, receivedQty: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inventoryTransfer.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getTransfer(actor: Actor, id: string) {
  requirePermission(actor, "transfers.view");
  const t = await db.inventoryTransfer.findUnique({
    where: { id },
    include: {
      source: true,
      destination: true,
      items: { include: { product: { select: { id: true, name: true, nameAr: true, sku: true, baseUnit: true } } } },
    },
  });
  if (!t) throw notFound();
  assertParticipant(actor, t);
  const events = await db.workflowEvent.findMany({ where: { entityType: ENTITY, entityId: id }, orderBy: { createdAt: "asc" } });
  const users = await db.user.findMany({
    where: { id: { in: [t.requestedById, t.approvedById, t.dispatchedById, t.receivedById, ...events.map((e) => e.userId)].filter(Boolean) as string[] } },
    select: { id: true, name: true },
  });
  // Source stock levels, to help the approver.
  const stock = await db.branchInventory.findMany({
    where: { branchId: t.sourceBranchId, productId: { in: t.items.map((i) => i.productId) } },
    select: { productId: true, quantity: true, reserved: true },
  });
  return { transfer: t, events, users, sourceStock: stock };
}

export async function createTransfer(
  actor: Actor,
  input: { sourceBranchId: string; destinationBranchId: string; notes?: string | null; items: { productId: string; quantity: number }[] },
) {
  requirePermission(actor, "transfers.manage");
  if (input.sourceBranchId === input.destinationBranchId) throw new AppError("same_branch");
  assertParticipant(actor, input);
  if (!input.items.length) throw new AppError("no_lines");
  const seen = new Set<string>();
  for (const i of input.items) {
    if (!(i.quantity > 0)) throw new AppError("quantity_invalid");
    if (seen.has(i.productId)) throw new AppError("duplicate_product");
    seen.add(i.productId);
  }
  return withTx(undefined, async (tx) => {
    const branches = await tx.branch.findMany({ where: { id: { in: [input.sourceBranchId, input.destinationBranchId] }, status: "ACTIVE" } });
    if (branches.length !== 2) throw new AppError("branch_inactive");
    const t = await tx.inventoryTransfer.create({
      data: {
        sourceBranchId: input.sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        requestedById: actor.id,
        notes: input.notes || null,
        items: { create: input.items.map((i) => ({ productId: i.productId, requestedQty: q3(i.quantity) })) },
      },
    });
    await recordEvent(tx, { entityType: ENTITY, entityId: t.id, to: "REQUESTED", userId: actor.id });
    await audit(actor, { action: "transfer.create", entityType: ENTITY, entityId: t.id, branchId: input.sourceBranchId, after: input }, tx);
    const full = await lock(tx, t.id);
    for (const locale of ["ar", "en"] as const) {
      const ids = (await branchSupervisors(tx, [input.sourceBranchId])).filter((i) => i !== actor.id);
      const users = await tx.user.findMany({ where: { id: { in: ids }, locale }, select: { id: true } });
      if (users.length)
        await notify(tx, {
          userIds: users.map((u) => u.id),
          type: "transfer",
          key: "transfer.status",
          params: { no: full.seq, status: statusLabel("REQUESTED", locale), from: full.source.nameAr || full.source.name, to: full.destination.nameAr || full.destination.name },
          link: `/transfers/${t.id}`,
          severity: "warning",
        });
    }
    return t;
  });
}

export async function approveTransfer(actor: Actor, id: string, note?: string | null) {
  requirePermission(actor, "transfers.manage");
  return withTx(undefined, async (tx) => {
    const t = await lock(tx, id);
    assertBranchAccess(actor, t.sourceBranchId); // the giving branch approves
    await move(tx, t, "APPROVED", actor, { approvedById: actor.id, approvedAt: new Date() }, note);
    await audit(actor, { action: "transfer.approve", entityType: ENTITY, entityId: id, branchId: t.sourceBranchId }, tx);
  });
}

export async function dispatchTransfer(
  actor: Actor,
  id: string,
  input: { lines?: { itemId: string; quantity: number }[]; note?: string | null; idempotencyKey: string },
) {
  requirePermission(actor, "transfers.manage");
  try {
    return await withTx(undefined, async (tx) => {
      await tx.idempotencyKey.create({ data: { key: input.idempotencyKey, userId: actor.id, scope: `dispatch:${id}` } });
      const t = await lock(tx, id);
      assertBranchAccess(actor, t.sourceBranchId);
      if (t.status !== "APPROVED") throw new AppError("invalid_transition", { from: t.status, to: "DISPATCHED" });
      const qty = new Map((input.lines ?? []).map((l) => [l.itemId, l.quantity]));
      const lines = t.items
        .map((it) => ({ it, q: qty.has(it.id) ? qty.get(it.id)! : num(it.requestedQty) }))
        .filter((x) => x.q > 0);
      for (const { it, q } of lines) if (q > num(it.requestedQty) + 1e-9) throw new AppError("over_dispatch");
      if (!lines.length) throw new AppError("no_lines");
      await postMovements(actor, {
        branchId: t.sourceBranchId,
        lines: lines.map(({ it, q }) => ({ productId: it.productId, type: "TRANSFER_OUT" as const, quantity: q, transferId: id, reason: `TRF-${t.seq}` })),
      }, tx);
      for (const it of t.items) {
        const q = lines.find((l) => l.it.id === it.id)?.q ?? 0;
        await tx.inventoryTransferItem.update({ where: { id: it.id }, data: { dispatchedQty: q } });
      }
      await move(tx, t, "DISPATCHED", actor, { dispatchedById: actor.id, dispatchedAt: new Date() }, input.note);
      await audit(actor, { action: "transfer.dispatch", entityType: ENTITY, entityId: id, branchId: t.sourceBranchId, after: { lines: lines.map((l) => ({ productId: l.it.productId, quantity: l.q })) } }, tx);
      return { replayed: false };
    });
  } catch (e) {
    if (isUniqueViolation(e, "key")) return { replayed: true };
    throw e;
  }
}

export async function receiveTransfer(
  actor: Actor,
  id: string,
  input: { lines: { itemId: string; quantity: number }[]; note?: string | null; idempotencyKey: string },
) {
  requirePermission(actor, "transfers.manage");
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (!lines.length) throw new AppError("no_lines");
  try {
    return await withTx(undefined, async (tx) => {
      await tx.idempotencyKey.create({ data: { key: input.idempotencyKey, userId: actor.id, scope: `treceive:${id}` } });
      const t = await lock(tx, id);
      assertBranchAccess(actor, t.destinationBranchId);
      if (!["DISPATCHED", "PARTIALLY_RECEIVED"].includes(t.status)) throw new AppError("invalid_transition", { from: t.status, to: "COMPLETED" });
      const items = new Map(t.items.map((i) => [i.id, i]));
      for (const l of lines) {
        const it = items.get(l.itemId);
        if (!it) throw notFound();
        const remaining = q3(num(it.dispatchedQty) - num(it.receivedQty));
        if (l.quantity > remaining + 1e-9) throw new AppError("over_receipt", { remaining });
      }
      await postMovements(actor, {
        branchId: t.destinationBranchId,
        lines: lines.map((l) => ({ productId: items.get(l.itemId)!.productId, type: "TRANSFER_IN" as const, quantity: l.quantity, transferId: id, reason: `TRF-${t.seq}` })),
      }, tx);
      for (const l of lines) await tx.inventoryTransferItem.update({ where: { id: l.itemId }, data: { receivedQty: { increment: l.quantity } } });
      const after = await tx.inventoryTransferItem.findMany({ where: { transferId: id } });
      const complete = after.every((i) => num(i.receivedQty) >= num(i.dispatchedQty));
      await move(tx, t, complete ? "COMPLETED" : "PARTIALLY_RECEIVED", actor, { receivedById: actor.id, ...(complete ? { completedAt: new Date() } : {}) }, input.note);
      await audit(actor, { action: "transfer.receive", entityType: ENTITY, entityId: id, branchId: t.destinationBranchId, after: { lines } }, tx);
      return { replayed: false, complete };
    });
  } catch (e) {
    if (isUniqueViolation(e, "key")) return { replayed: true, complete: undefined };
    throw e;
  }
}

/** Close a partially received transfer; the shortfall is recorded as transit loss. */
export async function closeTransfer(actor: Actor, id: string, reason: string) {
  requirePermission(actor, "transfers.manage");
  if (!reason?.trim()) throw new AppError("reason_required");
  return withTx(undefined, async (tx) => {
    const t = await lock(tx, id);
    assertBranchAccess(actor, t.destinationBranchId);
    if (t.status !== "PARTIALLY_RECEIVED") throw new AppError("invalid_transition", { from: t.status, to: "COMPLETED" });
    const shortfall = t.items
      .map((i) => ({ productId: i.productId, quantity: q3(num(i.dispatchedQty) - num(i.receivedQty)) }))
      .filter((x) => x.quantity > 0);
    await move(tx, t, "COMPLETED", actor, { completedAt: new Date(), notes: [t.notes, reason].filter(Boolean).join("\n") }, reason);
    await audit(actor, { action: "transfer.close_short", entityType: ENTITY, entityId: id, branchId: t.destinationBranchId, summary: reason, after: { shortfall } }, tx);
  });
}

export async function cancelTransfer(actor: Actor, id: string, reason: string) {
  requirePermission(actor, "transfers.manage");
  if (!reason?.trim()) throw new AppError("reason_required");
  return withTx(undefined, async (tx) => {
    const t = await lock(tx, id);
    assertParticipant(actor, t);
    await move(tx, t, "CANCELLED", actor, { cancelledAt: new Date(), cancelReason: reason }, reason);
    await audit(actor, { action: "transfer.cancel", entityType: ENTITY, entityId: id, branchId: t.sourceBranchId, summary: reason }, tx);
  });
}
