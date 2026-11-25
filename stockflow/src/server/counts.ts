/** Physical inventory counts and reconciliation. */
import type { CountStatus, Prisma as P } from "@prisma/client";
import { db, withTx, type Tx } from "./db";
import { AppError, notFound } from "./errors";
import { assertBranchAccess, branchWhere, requirePermission, type Actor } from "./rbac";
import { postMovements } from "./inventory/ledger";
import { audit } from "./audit";
import { recordEvent } from "./workflow";
import { branchSupervisors, notify } from "./notifications";
import { statusLabel } from "./notifications/messages";
import { num, q3 } from "@/lib/num";

const ENTITY = "count";

async function lock(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM inventory_counts WHERE id = ${id} FOR UPDATE`;
  const c = await tx.inventoryCount.findUnique({ where: { id }, include: { items: true, branch: true } });
  if (!c) throw notFound();
  return c;
}

export function variance(item: { systemQty: P.Decimal | number | null; countedQty: P.Decimal | number | null }) {
  if (item.countedQty === null || item.systemQty === null) return null;
  return q3(num(item.countedQty) - num(item.systemQty));
}

export async function createCount(
  actor: Actor,
  input: { branchId: string; categoryId?: string | null; productIds?: string[]; notes?: string | null },
) {
  requirePermission(actor, "counts.manage");
  assertBranchAccess(actor, input.branchId);
  return withTx(undefined, async (tx) => {
    const open = await tx.inventoryCount.findFirst({
      where: { branchId: input.branchId, status: { in: ["IN_PROGRESS", "SUBMITTED"] }, categoryId: input.categoryId || null },
    });
    if (open) throw new AppError("count_already_open", { no: open.seq });
    const products = await tx.product.findMany({
      where: {
        status: "ACTIVE",
        ...(input.productIds?.length ? { id: { in: input.productIds } } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      },
      select: { id: true },
      orderBy: { name: "asc" },
    });
    if (!products.length) throw new AppError("no_lines");
    const c = await tx.inventoryCount.create({
      data: {
        branchId: input.branchId,
        categoryId: input.categoryId || null,
        createdById: actor.id,
        notes: input.notes || null,
        items: { create: products.map((p) => ({ productId: p.id })) },
      },
    });
    await recordEvent(tx, { entityType: ENTITY, entityId: c.id, to: "IN_PROGRESS", userId: actor.id });
    await audit(actor, { action: "count.create", entityType: ENTITY, entityId: c.id, branchId: input.branchId, after: { items: products.length, categoryId: input.categoryId } }, tx);
    return c;
  });
}

export async function enterCounts(
  actor: Actor,
  id: string,
  entries: { itemId: string; countedQty: number | null; reason?: string | null }[],
) {
  requirePermission(actor, "counts.enter");
  return withTx(undefined, async (tx) => {
    const c = await lock(tx, id);
    assertBranchAccess(actor, c.branchId);
    if (c.status !== "IN_PROGRESS") throw new AppError("not_editable");
    const byId = new Map(c.items.map((i) => [i.id, i]));
    for (const e of entries) {
      const item = byId.get(e.itemId);
      if (!item) throw notFound();
      if (e.countedQty !== null && (!(e.countedQty >= 0) || !Number.isFinite(e.countedQty))) throw new AppError("quantity_invalid");
      if (e.countedQty === null) {
        await tx.inventoryCountItem.update({ where: { id: item.id }, data: { countedQty: null, systemQty: null, countedAt: null, countedById: null, reason: e.reason ?? null } });
        continue;
      }
      // Snapshot the system quantity at the moment of counting (only when the count changes).
      const changed = item.countedQty === null || num(item.countedQty) !== e.countedQty;
      let systemQty = item.systemQty;
      if (changed) {
        const inv = await tx.branchInventory.findUnique({ where: { branchId_productId: { branchId: c.branchId, productId: item.productId } } });
        systemQty = (inv?.quantity ?? 0) as P.Decimal;
      }
      await tx.inventoryCountItem.update({
        where: { id: item.id },
        data: {
          countedQty: e.countedQty,
          systemQty,
          reason: e.reason?.slice(0, 300) ?? item.reason,
          ...(changed ? { countedById: actor.id, countedAt: new Date() } : {}),
        },
      });
    }
  });
}

export async function submitCount(actor: Actor, id: string) {
  requirePermission(actor, "counts.manage");
  return withTx(undefined, async (tx) => {
    const c = await lock(tx, id);
    assertBranchAccess(actor, c.branchId);
    if (c.status !== "IN_PROGRESS") throw new AppError("invalid_transition", { from: c.status, to: "SUBMITTED" });
    const counted = c.items.filter((i) => i.countedQty !== null);
    if (!counted.length) throw new AppError("nothing_counted");
    const missingReason = counted.filter((i) => variance(i) !== 0 && !i.reason?.trim());
    if (missingReason.length) throw new AppError("variance_reason_required", { n: missingReason.length });
    await tx.inventoryCount.update({ where: { id }, data: { status: "SUBMITTED", submittedById: actor.id, submittedAt: new Date() } });
    await recordEvent(tx, { entityType: ENTITY, entityId: id, from: c.status, to: "SUBMITTED", userId: actor.id });
    const variances = counted.filter((i) => variance(i) !== 0).length;
    await notify(tx, {
      userIds: (await branchSupervisors(tx, [c.branchId])).filter((u) => u !== actor.id),
      type: "count",
      key: "count.submitted",
      params: { no: c.seq, branch: c.branch.nameAr || c.branch.name, variances },
      link: `/counts/${id}`,
      severity: "warning",
    });
  });
}

/** Approve: post COUNT_CORRECTION transactions (counted − snapshot) on top of the current balance. */
export async function approveCount(actor: Actor, id: string, note?: string | null) {
  requirePermission(actor, "counts.approve");
  return withTx(undefined, async (tx) => {
    const c = await lock(tx, id);
    assertBranchAccess(actor, c.branchId);
    if (c.status !== "SUBMITTED") throw new AppError("invalid_transition", { from: c.status, to: "APPROVED" });
    const lines = c.items
      .map((i) => ({ i, v: variance(i) }))
      .filter((x): x is { i: (typeof c.items)[number]; v: number } => x.v !== null && x.v !== 0);
    if (lines.length) {
      const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.i.productId) } }, select: { id: true, baseUnit: true } });
      const unit = new Map(products.map((p) => [p.id, p.baseUnit]));
      await postMovements(actor, {
        branchId: c.branchId,
        lines: lines.map(({ i, v }) => ({
          productId: i.productId,
          type: "COUNT_CORRECTION" as const,
          quantity: v,
          unit: unit.get(i.productId),
          countId: id,
          reason: i.reason || `CNT-${c.seq}`,
          notes: `CNT-${c.seq}: system ${num(i.systemQty)} → counted ${num(i.countedQty)}`,
        })),
      }, tx);
    }
    await tx.inventoryCount.update({ where: { id }, data: { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note || null } });
    await recordEvent(tx, { entityType: ENTITY, entityId: id, from: c.status, to: "APPROVED", userId: actor.id, note });
    await audit(actor, {
      action: "count.approve",
      entityType: ENTITY,
      entityId: id,
      branchId: c.branchId,
      after: { corrections: lines.map((l) => ({ productId: l.i.productId, variance: l.v, reason: l.i.reason })) },
    }, tx);
    await notifyReviewed(tx, c, "APPROVED");
  });
}

/** Reject sends the count back for re-counting. */
export async function rejectCount(actor: Actor, id: string, note: string) {
  requirePermission(actor, "counts.approve");
  if (!note?.trim()) throw new AppError("reason_required");
  return withTx(undefined, async (tx) => {
    const c = await lock(tx, id);
    assertBranchAccess(actor, c.branchId);
    if (c.status !== "SUBMITTED") throw new AppError("invalid_transition", { from: c.status, to: "REJECTED" });
    await tx.inventoryCount.update({ where: { id }, data: { status: "IN_PROGRESS", reviewNote: note } });
    await recordEvent(tx, { entityType: ENTITY, entityId: id, from: c.status, to: "REJECTED", userId: actor.id, note });
    await audit(actor, { action: "count.reject", entityType: ENTITY, entityId: id, branchId: c.branchId, summary: note }, tx);
    await notifyReviewed(tx, c, "REJECTED");
  });
}

export async function cancelCount(actor: Actor, id: string, note: string) {
  requirePermission(actor, "counts.manage");
  return withTx(undefined, async (tx) => {
    const c = await lock(tx, id);
    assertBranchAccess(actor, c.branchId);
    if (!["IN_PROGRESS", "SUBMITTED"].includes(c.status)) throw new AppError("invalid_transition", { from: c.status, to: "CANCELLED" });
    await tx.inventoryCount.update({ where: { id }, data: { status: "CANCELLED", reviewNote: note || null } });
    await recordEvent(tx, { entityType: ENTITY, entityId: id, from: c.status, to: "CANCELLED", userId: actor.id, note });
    await audit(actor, { action: "count.cancel", entityType: ENTITY, entityId: id, branchId: c.branchId, summary: note }, tx);
  });
}

async function notifyReviewed(tx: Tx, c: Awaited<ReturnType<typeof lock>>, status: string) {
  const ids = [c.createdById, c.submittedById].filter(Boolean) as string[];
  const users = await tx.user.findMany({ where: { id: { in: ids } } });
  for (const u of users) {
    await notify(tx, {
      userIds: [u.id],
      type: "count",
      key: "count.reviewed",
      params: { no: c.seq, status: statusLabel(status, u.locale), branch: c.branch.nameAr || c.branch.name },
      link: `/counts/${c.id}`,
      severity: status === "APPROVED" ? "success" : "warning",
    });
  }
}

export async function listCounts(actor: Actor, f: { branchId?: string; status?: CountStatus; page?: number } = {}) {
  requirePermission(actor, "counts.view");
  if (f.branchId) assertBranchAccess(actor, f.branchId);
  const where: P.InventoryCountWhereInput = {
    ...branchWhere(actor),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.inventoryCount.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, nameAr: true, code: true } },
        category: { select: { name: true, nameAr: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.inventoryCount.count({ where }),
  ]);
  return { rows, total, page, pageSize: 30 };
}

export async function getCount(actor: Actor, id: string) {
  requirePermission(actor, "counts.enter");
  const c = await db.inventoryCount.findUnique({
    where: { id },
    include: {
      branch: true,
      category: true,
      items: {
        include: { product: { select: { id: true, name: true, nameAr: true, sku: true, barcode: true, baseUnit: true, costPrice: true } } },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!c) throw notFound();
  assertBranchAccess(actor, c.branchId);
  const inv = await db.branchInventory.findMany({
    where: { branchId: c.branchId, productId: { in: c.items.map((i) => i.productId) } },
    select: { productId: true, quantity: true },
  });
  const events = await db.workflowEvent.findMany({ where: { entityType: ENTITY, entityId: id }, orderBy: { createdAt: "asc" } });
  const users = await db.user.findMany({
    where: { id: { in: [c.createdById, c.submittedById, c.reviewedById, ...events.map((e) => e.userId)].filter(Boolean) as string[] } },
    select: { id: true, name: true },
  });
  return { count: c, current: new Map(inv.map((i) => [i.productId, num(i.quantity)])), events, users };
}
