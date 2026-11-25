/**
 * Replenishment workflow (also serves as the purchase order once approved).
 *
 * DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_SUPPLIER → ACCEPTED → IN_TRANSIT
 *   → PARTIALLY_RECEIVED → RECEIVED;  CANCELLED from any state before goods arrive.
 */
import type { BranchInventory, Product, ProductUnit, ReplenishmentStatus, Settings, Supplier, Prisma as P } from "@prisma/client";
import { db, withTx, type Tx } from "./db";
import { AppError, isUniqueViolation, notFound } from "./errors";
import { assertBranchAccess, branchWhere, requirePermission, type Actor } from "./rbac";
import { getSettings } from "./settings";
import { audit } from "./audit";
import { recordEvent } from "./workflow";
import { postMovements } from "./inventory/ledger";
import { OPEN_REQUEST_STATUSES, recommendationFor } from "./inventory/recommend";
import { branchSupervisors, notify, supplierUsers } from "./notifications";
import { statusLabel } from "./notifications/messages";
import { num, q3 } from "@/lib/num";

const ENTITY = "replenishment";

const TRANSITIONS: Record<ReplenishmentStatus, ReplenishmentStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  SENT_TO_SUPPLIER: ["ACCEPTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  ACCEPTED: ["IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["PARTIALLY_RECEIVED", "RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};

export const EDITABLE: ReplenishmentStatus[] = ["DRAFT", "PENDING_APPROVAL"];
export const RECEIVABLE: ReplenishmentStatus[] = ["APPROVED", "SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"];
export const SUPPLIER_VISIBLE: ReplenishmentStatus[] = [
  "SENT_TO_SUPPLIER",
  "ACCEPTED",
  "IN_TRANSIT",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

async function lockRequest(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM replenishment_requests WHERE id = ${id} FOR UPDATE`;
  const r = await tx.replenishmentRequest.findUnique({
    where: { id },
    include: { items: true, branch: true, supplier: true },
  });
  if (!r) throw notFound();
  return r;
}

async function transition(
  tx: Tx,
  req: { id: string; status: ReplenishmentStatus },
  to: ReplenishmentStatus,
  actor: Actor | null,
  data: P.ReplenishmentRequestUpdateInput = {},
  note?: string | null,
  eventTo?: string,
) {
  if (!TRANSITIONS[req.status].includes(to)) {
    throw new AppError("invalid_transition", { from: req.status, to });
  }
  const updated = await tx.replenishmentRequest.update({ where: { id: req.id }, data: { ...data, status: to } });
  await recordEvent(tx, { entityType: ENTITY, entityId: req.id, from: req.status, to: eventTo ?? to, userId: actor?.id, note });
  return updated;
}

function branchLabel(b: { name: string; nameAr: string | null }) {
  return b.nameAr || b.name;
}

async function notifyStatus(
  tx: Tx,
  req: { id: string; seq: number; branchId: string; createdById: string | null; branch: { name: string; nameAr: string | null } },
  status: string,
  note: string,
  extra: string[] = [],
) {
  const ids = await branchSupervisors(tx, [req.branchId]);
  if (req.createdById) ids.push(req.createdById);
  // Status labels are rendered per recipient locale by the template; we pass the Arabic
  // label and let English recipients see the English label via `data`.
  for (const locale of ["ar", "en"] as const) {
    const users = await tx.user.findMany({ where: { id: { in: [...ids, ...extra] }, locale }, select: { id: true } });
    if (!users.length) continue;
    await notify(tx, {
      userIds: users.map((u) => u.id),
      type: "replenishment",
      key: "replenishment.status",
      params: { no: req.seq, status: statusLabel(status, locale), branch: branchLabel(req.branch), note },
      link: `/replenishment/${req.id}`,
      severity: status === "CANCELLED" ? "warning" : "info",
    });
  }
}

type InvFull = BranchInventory & {
  product: Product & { units: ProductUnit[]; supplier: Supplier | null };
  branch: { id: string; name: string; nameAr: string | null; reviewPeriodDays: number };
};

/**
 * Called by the alert engine when a new alert opens. Adds the product to an existing auto
 * draft for the same branch and supplier, or creates one. Never duplicates a product that
 * is already on an open request for the branch.
 */
export async function ensureAutoDraft(
  tx: Tx,
  { inv, alertId, settings, actor }: { inv: InvFull; alertId: string; settings: Settings; actor: Actor | null },
) {
  const covering = await tx.replenishmentRequestItem.findFirst({
    where: {
      productId: inv.productId,
      request: { branchId: inv.branchId, status: { in: [...OPEN_REQUEST_STATUSES] } },
    },
    include: { request: true },
  });
  if (covering) {
    const pending = !["DRAFT", "PENDING_APPROVAL"].includes(covering.request.status);
    await tx.stockAlert.update({
      where: { id: alertId },
      data: { replenishmentId: covering.requestId, ...(pending ? { status: "REPLENISHMENT_PENDING" } : {}) },
    });
    return covering.request;
  }

  const rec = await recommendationFor(tx, inv, inv.branch.reviewPeriodDays, settings);
  if (rec.recommended <= 0) return null;

  const supplierId = inv.product.defaultSupplierId;
  let req = await tx.replenishmentRequest.findFirst({
    where: { branchId: inv.branchId, supplierId, status: "DRAFT", source: "AUTO" },
    orderBy: { createdAt: "desc" },
  });
  const isNew = !req;
  if (!req) {
    req = await tx.replenishmentRequest.create({
      data: { branchId: inv.branchId, supplierId, status: "DRAFT", source: "AUTO" },
    });
    await recordEvent(tx, { entityType: ENTITY, entityId: req.id, to: "DRAFT", note: "auto" });
  }
  await tx.replenishmentRequestItem.create({
    data: {
      requestId: req.id,
      productId: inv.productId,
      recommendedQty: rec.recommended,
      requestedQty: rec.recommended,
      unitCost: inv.product.costPrice,
      calculation: rec as unknown as P.InputJsonValue,
    },
  });
  await tx.stockAlert.update({ where: { id: alertId }, data: { replenishmentId: req.id } });

  if (settings.autoApproveReplenishment && supplierId) {
    // Owner-enabled automated purchasing policy.
    const full = await lockRequest(tx, req.id);
    await approveInTx(tx, full, null, "auto-policy");
    await sendInTx(tx, await lockRequest(tx, req.id), null);
    await audit(actor, {
      action: "replenishment.auto_approve",
      entityType: ENTITY,
      entityId: req.id,
      branchId: inv.branchId,
      summary: "Automated purchasing policy",
    }, tx);
  } else if (isNew) {
    await notify(tx, {
      userIds: await branchSupervisors(tx, [inv.branchId]),
      type: "replenishment",
      key: "replenishment.draft",
      params: { no: req.seq, branch: branchLabel(inv.branch), items: 1 },
      link: `/replenishment/${req.id}`,
      severity: "info",
    });
  }
  return req;
}

// ───────────────────────────── Queries ─────────────────────────────

export interface RequestFilters {
  branchId?: string;
  status?: ReplenishmentStatus | "OPEN";
  supplierId?: string;
  page?: number;
  pageSize?: number;
}

export async function listRequests(actor: Actor, f: RequestFilters = {}) {
  requirePermission(actor, "replenishment.view");
  if (f.branchId) assertBranchAccess(actor, f.branchId);
  const where: P.ReplenishmentRequestWhereInput = {
    ...branchWhere(actor),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(f.status === "OPEN"
      ? { status: { in: [...OPEN_REQUEST_STATUSES] } }
      : f.status
        ? { status: f.status }
        : {}),
  };
  const pageSize = Math.min(f.pageSize ?? 30, 100);
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.replenishmentRequest.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, nameAr: true, code: true } },
        supplier: { select: { id: true, name: true } },
        items: { select: { requestedQty: true, receivedQty: true, unitCost: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.replenishmentRequest.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getRequest(actor: Actor, id: string) {
  const req = await db.replenishmentRequest.findUnique({
    where: { id },
    include: {
      branch: true,
      supplier: true,
      items: {
        include: { product: { include: { units: true } } },
        orderBy: { product: { name: "asc" } },
      },
      receipts: {
        include: { items: true, attachment: true },
        orderBy: { createdAt: "asc" },
      },
      documents: { include: { attachment: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!req) throw notFound();
  if (actor.role === "SUPPLIER") {
    if (req.supplierId !== actor.supplierId || !SUPPLIER_VISIBLE.includes(req.status)) throw notFound();
  } else {
    requirePermission(actor, "replenishment.view");
    assertBranchAccess(actor, req.branchId);
  }
  const userIds = [req.createdById, req.approvedById, ...req.receipts.map((r) => r.receivedById)].filter(Boolean) as string[];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const events = await db.workflowEvent.findMany({ where: { entityType: ENTITY, entityId: id }, orderBy: { createdAt: "asc" } });
  const eventUsers = await db.user.findMany({
    where: { id: { in: events.map((e) => e.userId).filter(Boolean) as string[] } },
    select: { id: true, name: true },
  });
  return { req, users: [...users, ...eventUsers], events };
}

// ───────────────────────────── Commands ─────────────────────────────

export interface ItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

function validateItems(items: ItemInput[]) {
  if (!items.length) throw new AppError("no_lines");
  const seen = new Set<string>();
  for (const it of items) {
    if (!(it.quantity > 0)) throw new AppError("quantity_invalid");
    if (seen.has(it.productId)) throw new AppError("duplicate_product");
    seen.add(it.productId);
  }
}

async function buildItems(tx: Tx, branchId: string, items: ItemInput[], supplier: Supplier | null, excludeRequestId?: string) {
  const settings = await getSettings(tx);
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
  const products = await tx.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    include: { units: true, supplier: true },
  });
  if (products.length !== items.length) throw new AppError("product_not_found", {}, 404);
  const out: P.ReplenishmentRequestItemCreateManyRequestInput[] = [];
  for (const it of items) {
    const product = products.find((p) => p.id === it.productId)!;
    const inv =
      (await tx.branchInventory.findUnique({ where: { branchId_productId: { branchId, productId: it.productId } } })) ??
      ({ branchId, productId: it.productId, quantity: 0, reserved: 0, minStock: 0, reorderQty: 0, maxStock: 0, safetyStock: 0, avgDailyConsumption: 0 } as unknown as BranchInventory);
    const rec = await recommendationFor(tx, { ...inv, product }, branch.reviewPeriodDays, settings, {
      excludeRequestId,
      supplier: supplier ?? product.supplier,
    });
    out.push({
      productId: it.productId,
      recommendedQty: rec.recommended,
      requestedQty: q3(it.quantity),
      unitCost: it.unitCost ?? product.costPrice,
      calculation: rec as unknown as P.InputJsonValue,
    });
  }
  return out;
}

export async function createRequest(
  actor: Actor,
  input: { branchId: string; supplierId?: string | null; notes?: string | null; items: ItemInput[]; submit?: boolean },
) {
  requirePermission(actor, "replenishment.manage");
  assertBranchAccess(actor, input.branchId);
  validateItems(input.items);
  return withTx(undefined, async (tx) => {
    const supplier = input.supplierId ? await tx.supplier.findUnique({ where: { id: input.supplierId } }) : null;
    if (input.supplierId && !supplier) throw notFound();
    const items = await buildItems(tx, input.branchId, input.items, supplier);
    const req = await tx.replenishmentRequest.create({
      data: {
        branchId: input.branchId,
        supplierId: input.supplierId || null,
        notes: input.notes || null,
        source: "MANUAL",
        createdById: actor.id,
        status: "DRAFT",
        items: { createMany: { data: items } },
      },
      include: { branch: true, items: true },
    });
    await recordEvent(tx, { entityType: ENTITY, entityId: req.id, to: "DRAFT", userId: actor.id });
    await linkAlerts(tx, req.id, req.branchId, input.items.map((i) => i.productId), false);
    await audit(actor, { action: "replenishment.create", entityType: ENTITY, entityId: req.id, branchId: req.branchId, after: { items: input.items } }, tx);
    if (input.submit) await submitInTx(tx, await lockRequest(tx, req.id), actor);
    return req;
  });
}

export async function updateRequest(
  actor: Actor,
  id: string,
  input: { supplierId?: string | null; notes?: string | null; items: ItemInput[] },
) {
  requirePermission(actor, "replenishment.manage");
  validateItems(input.items);
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    assertBranchAccess(actor, req.branchId);
    if (!EDITABLE.includes(req.status)) throw new AppError("not_editable");
    const supplier = input.supplierId ? await tx.supplier.findUnique({ where: { id: input.supplierId } }) : null;
    const items = await buildItems(tx, req.branchId, input.items, supplier, id);
    // Keep the original recommendation for products already on the request.
    const prev = new Map(req.items.map((i) => [i.productId, i]));
    await tx.replenishmentRequestItem.deleteMany({ where: { requestId: id } });
    await tx.replenishmentRequestItem.createMany({
      data: items.map((it) => {
        const p = prev.get(it.productId);
        return {
          ...it,
          requestId: id,
          ...(p ? { recommendedQty: p.recommendedQty, calculation: (p.calculation ?? undefined) as P.InputJsonValue | undefined } : {}),
        };
      }),
    });
    await tx.replenishmentRequest.update({
      where: { id },
      data: { supplierId: input.supplierId || null, notes: input.notes ?? null },
    });
    // Unlink alerts for removed products.
    const keep = input.items.map((i) => i.productId);
    await tx.stockAlert.updateMany({
      where: { replenishmentId: id, productId: { notIn: keep }, status: { not: "RESOLVED" } },
      data: { replenishmentId: null, status: "OPEN" },
    });
    await linkAlerts(tx, id, req.branchId, keep, false);
    await audit(actor, {
      action: "replenishment.update",
      entityType: ENTITY,
      entityId: id,
      branchId: req.branchId,
      before: { supplierId: req.supplierId, items: req.items.map((i) => ({ productId: i.productId, quantity: num(i.requestedQty) })) },
      after: { supplierId: input.supplierId, items: input.items },
    }, tx);
  });
}

async function linkAlerts(tx: Tx, requestId: string, branchId: string, productIds: string[], pending: boolean) {
  await tx.stockAlert.updateMany({
    where: { branchId, productId: { in: productIds }, status: { not: "RESOLVED" } },
    data: { replenishmentId: requestId, ...(pending ? { status: "REPLENISHMENT_PENDING" } : {}) },
  });
}

async function submitInTx(tx: Tx, req: Awaited<ReturnType<typeof lockRequest>>, actor: Actor) {
  await transition(tx, req, "PENDING_APPROVAL", actor);
  await notify(tx, {
    userIds: (await branchSupervisors(tx, [req.branchId])).filter((u) => u !== actor.id),
    type: "replenishment",
    key: "replenishment.pending",
    params: { no: req.seq, branch: branchLabel(req.branch), items: req.items.length },
    link: `/replenishment/${req.id}`,
    severity: "warning",
    external: true,
  });
}

export async function submitRequest(actor: Actor, id: string) {
  requirePermission(actor, "replenishment.manage");
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    assertBranchAccess(actor, req.branchId);
    if (!req.items.length) throw new AppError("no_lines");
    await submitInTx(tx, req, actor);
  });
}

async function approveInTx(tx: Tx, req: Awaited<ReturnType<typeof lockRequest>>, actor: Actor | null, note?: string) {
  if (!req.items.length) throw new AppError("no_lines");
  await transition(tx, req, "APPROVED", actor, { approvedById: actor?.id ?? null, approvedAt: new Date() }, note);
  await linkAlerts(tx, req.id, req.branchId, req.items.map((i) => i.productId), true);
}

export async function approveRequest(actor: Actor, id: string, note?: string) {
  requirePermission(actor, "replenishment.approve");
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    assertBranchAccess(actor, req.branchId);
    await approveInTx(tx, req, actor, note);
    await audit(actor, {
      action: "replenishment.approve",
      entityType: ENTITY,
      entityId: id,
      branchId: req.branchId,
      after: { items: req.items.map((i) => ({ productId: i.productId, quantity: num(i.requestedQty), unitCost: num(i.unitCost) })) },
    }, tx);
    await notifyStatus(tx, req, "APPROVED", note || "");
  });
}

async function sendInTx(tx: Tx, req: Awaited<ReturnType<typeof lockRequest>>, actor: Actor | null) {
  if (req.status !== "APPROVED") throw new AppError("invalid_transition", { from: req.status, to: "SENT_TO_SUPPLIER" });
  if (!req.supplierId || !req.supplier) throw new AppError("supplier_required");
  await transition(tx, req, "SENT_TO_SUPPLIER", actor, { sentAt: new Date() });
  const settings = await getSettings(tx);
  await notify(tx, {
    userIds: await supplierUsers(tx, req.supplierId),
    type: "replenishment",
    key: "replenishment.sent",
    params: { no: req.seq, business: settings.businessName, branch: branchLabel(req.branch), items: req.items.length },
    link: `/supplier/requests/${req.id}`,
    severity: "info",
    external: true,
  });
}

export async function sendToSupplier(actor: Actor, id: string) {
  requirePermission(actor, "replenishment.approve");
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    assertBranchAccess(actor, req.branchId);
    await sendInTx(tx, req, actor);
    await audit(actor, { action: "replenishment.send", entityType: ENTITY, entityId: id, branchId: req.branchId, after: { supplierId: req.supplierId } }, tx);
    await notifyStatus(tx, req, "SENT_TO_SUPPLIER", req.supplier?.name ?? "");
  });
}

export async function cancelRequest(actor: Actor, id: string, reason: string) {
  requirePermission(actor, "replenishment.manage");
  if (!reason?.trim()) throw new AppError("reason_required");
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    assertBranchAccess(actor, req.branchId);
    if (req.items.some((i) => num(i.receivedQty) > 0)) throw new AppError("already_received_use_close");
    if (!["DRAFT", "PENDING_APPROVAL"].includes(req.status)) requirePermission(actor, "replenishment.approve");
    await transition(tx, req, "CANCELLED", actor, { cancelledAt: new Date(), cancelReason: reason }, reason);
    await tx.stockAlert.updateMany({
      where: { replenishmentId: id, status: { not: "RESOLVED" } },
      data: { replenishmentId: null, status: "OPEN" },
    });
    await audit(actor, { action: "replenishment.cancel", entityType: ENTITY, entityId: id, branchId: req.branchId, summary: reason }, tx);
    await notifyStatus(tx, req, "CANCELLED", reason, req.supplierId && req.sentAt ? await supplierUsers(tx, req.supplierId) : []);
  });
}

/** Close a partially received request; the outstanding quantity is no longer expected. */
export async function closeRequest(actor: Actor, id: string, reason: string) {
  requirePermission(actor, "replenishment.approve");
  if (!reason?.trim()) throw new AppError("reason_required");
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    assertBranchAccess(actor, req.branchId);
    if (req.status !== "PARTIALLY_RECEIVED") throw new AppError("invalid_transition", { from: req.status, to: "RECEIVED" });
    await transition(tx, req, "RECEIVED", actor, { completedAt: new Date(), notes: [req.notes, reason].filter(Boolean).join("\n") }, reason, "CLOSED_SHORT");
    await tx.stockAlert.updateMany({ where: { replenishmentId: id, status: "REPLENISHMENT_PENDING" }, data: { status: "OPEN", replenishmentId: null } });
    await audit(actor, { action: "replenishment.close_short", entityType: ENTITY, entityId: id, branchId: req.branchId, summary: reason }, tx);
  });
}

export interface ReceiveInput {
  lines: { itemId: string; quantity: number }[];
  notes?: string | null;
  attachmentId?: string | null;
  idempotencyKey: string;
}

/** Record goods received (partial or full). Posts PURCHASE_RECEIPT transactions. */
export async function receiveRequest(actor: Actor, id: string, input: ReceiveInput) {
  requirePermission(actor, "replenishment.receive");
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (!lines.length) throw new AppError("no_lines");
  try {
    return await withTx(undefined, async (tx) => {
      await tx.idempotencyKey.create({ data: { key: input.idempotencyKey, userId: actor.id, scope: `receive:${id}` } });
      const req = await lockRequest(tx, id);
      assertBranchAccess(actor, req.branchId);
      if (!RECEIVABLE.includes(req.status)) throw new AppError("invalid_transition", { from: req.status, to: "RECEIVED" });

      const items = new Map(req.items.map((i) => [i.id, i]));
      for (const l of lines) {
        const it = items.get(l.itemId);
        if (!it) throw notFound();
        const remaining = q3(num(it.requestedQty) - num(it.receivedQty));
        if (l.quantity > remaining + 1e-9) throw new AppError("over_receipt", { remaining });
      }

      const receipt = await tx.replenishmentReceipt.create({
        data: {
          requestId: id,
          receivedById: actor.id,
          notes: input.notes || null,
          attachmentId: input.attachmentId || null,
          items: { create: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })) },
        },
      });

      await postMovements(actor, {
        branchId: req.branchId,
        lines: lines.map((l) => {
          const it = items.get(l.itemId)!;
          return {
            productId: it.productId,
            type: "PURCHASE_RECEIPT" as const,
            quantity: l.quantity,
            unitCost: num(it.unitCost),
            replenishmentId: id,
            receiptId: receipt.id,
            attachmentId: input.attachmentId || null,
            reason: `REQ-${req.seq}`,
          };
        }),
      }, tx);

      for (const l of lines) {
        await tx.replenishmentRequestItem.update({ where: { id: l.itemId }, data: { receivedQty: { increment: l.quantity } } });
      }
      const after = await tx.replenishmentRequestItem.findMany({ where: { requestId: id } });
      const complete = after.every((i) => num(i.receivedQty) >= num(i.requestedQty));
      const to: ReplenishmentStatus = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
      await transition(tx, req, to, actor, complete ? { completedAt: new Date() } : {}, input.notes);
      await audit(actor, {
        action: "replenishment.receive",
        entityType: ENTITY,
        entityId: id,
        branchId: req.branchId,
        after: { receiptId: receipt.id, lines },
      }, tx);
      await notifyStatus(tx, req, to, input.notes || "", req.supplierId ? await supplierUsers(tx, req.supplierId) : []);
      return { receiptId: receipt.id, status: to, replayed: false };
    });
  } catch (e) {
    if (isUniqueViolation(e, "key")) {
      const existing = await db.replenishmentRequest.findUnique({ where: { id }, select: { status: true } });
      return { receiptId: null, status: existing?.status, replayed: true };
    }
    throw e;
  }
}

// ───────────────────────────── Supplier portal ─────────────────────────────

function assertSupplier(actor: Actor) {
  requirePermission(actor, "supplier.portal");
  if (!actor.supplierId) throw new AppError("forbidden", {}, 403);
}

export async function listForSupplier(actor: Actor, status?: ReplenishmentStatus) {
  assertSupplier(actor);
  return db.replenishmentRequest.findMany({
    where: {
      supplierId: actor.supplierId!,
      status: status ? status : { in: SUPPLIER_VISIBLE },
    },
    include: {
      branch: { select: { name: true, nameAr: true, city: true, address: true, phone: true } },
      items: { select: { requestedQty: true, receivedQty: true } },
    },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
}

async function lockForSupplier(tx: Tx, actor: Actor, id: string) {
  const req = await lockRequest(tx, id);
  if (req.supplierId !== actor.supplierId || !SUPPLIER_VISIBLE.includes(req.status)) throw notFound();
  return req;
}

export async function supplierRespond(actor: Actor, id: string, accept: boolean, note?: string | null, expectedAt?: Date | null) {
  assertSupplier(actor);
  return withTx(undefined, async (tx) => {
    const req = await lockForSupplier(tx, actor, id);
    if (req.status !== "SENT_TO_SUPPLIER") throw new AppError("invalid_transition", { from: req.status, to: accept ? "ACCEPTED" : "DECLINED" });
    if (accept) {
      await transition(tx, req, "ACCEPTED", actor, { acceptedAt: new Date(), expectedAt: expectedAt ?? null, supplierNotes: note || null }, note);
    } else {
      if (!note?.trim()) throw new AppError("reason_required");
      // Declined: back to APPROVED so the branch can pick another supplier.
      await transition(tx, req, "APPROVED", actor, { supplierNotes: note, sentAt: null }, note, "DECLINED");
    }
    await audit(actor, { action: accept ? "supplier.accept" : "supplier.decline", entityType: ENTITY, entityId: id, branchId: req.branchId, summary: note ?? undefined }, tx);
    await notifyStatus(tx, req, accept ? "ACCEPTED" : "DECLINED", note || req.supplier?.name || "");
  });
}

export async function supplierUpdate(
  actor: Actor,
  id: string,
  input: { inTransit?: boolean; expectedAt?: Date | null; note?: string | null; confirmed?: { itemId: string; quantity: number }[] },
) {
  assertSupplier(actor);
  return withTx(undefined, async (tx) => {
    const req = await lockForSupplier(tx, actor, id);
    if (!["ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(req.status)) throw new AppError("not_editable");
    for (const c of input.confirmed ?? []) {
      const it = req.items.find((i) => i.id === c.itemId);
      if (!it) throw notFound();
      if (c.quantity < 0) throw new AppError("quantity_invalid");
      await tx.replenishmentRequestItem.update({ where: { id: it.id }, data: { supplierConfirmedQty: c.quantity } });
    }
    const data: P.ReplenishmentRequestUpdateInput = {
      ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
      ...(input.note ? { supplierNotes: input.note } : {}),
    };
    if (input.inTransit && req.status === "ACCEPTED") {
      await transition(tx, req, "IN_TRANSIT", actor, data, input.note);
      await notifyStatus(tx, req, "IN_TRANSIT", input.note || req.supplier?.name || "");
    } else {
      await tx.replenishmentRequest.update({ where: { id }, data });
      if (input.note) await recordEvent(tx, { entityType: ENTITY, entityId: id, from: req.status, to: req.status, userId: actor.id, note: input.note });
    }
    await audit(actor, { action: "supplier.update", entityType: ENTITY, entityId: id, branchId: req.branchId, after: input }, tx);
  });
}

/** Attach a document (delivery note, invoice) to a request. Staff or the assigned supplier. */
export async function addRequestDocument(actor: Actor, id: string, attachmentId: string, label?: string | null) {
  return withTx(undefined, async (tx) => {
    const req = await lockRequest(tx, id);
    if (actor.role === "SUPPLIER") {
      if (req.supplierId !== actor.supplierId || !SUPPLIER_VISIBLE.includes(req.status)) throw notFound();
    } else {
      requirePermission(actor, "replenishment.view");
      assertBranchAccess(actor, req.branchId);
    }
    const att = await tx.attachment.findUnique({ where: { id: attachmentId } });
    if (!att || att.uploadedById !== actor.id) throw notFound();
    await tx.attachment.update({ where: { id: attachmentId }, data: { branchId: req.branchId, supplierId: req.supplierId } });
    await tx.replenishmentDocument.create({ data: { requestId: id, attachmentId, uploadedById: actor.id, label: label || null } });
    await audit(actor, { action: "replenishment.document", entityType: ENTITY, entityId: id, branchId: req.branchId, summary: att.fileName }, tx);
  });
}
