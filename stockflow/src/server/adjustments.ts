/** Adjustment requests: damage, expiry, missing stock and corrections need approval. */
import type { AdjustmentKind, ApprovalStatus, TxType, Prisma as P } from "@prisma/client";
import { db, withTx } from "./db";
import { AppError, isUniqueViolation, notFound } from "./errors";
import { assertBranchAccess, branchWhere, can, hasBranchAccess, requirePermission, workingBranch, type Actor } from "./rbac";
import { postMovements } from "./inventory/ledger";
import { audit } from "./audit";
import { recordEvent } from "./workflow";
import { branchSupervisors, notify } from "./notifications";
import { statusLabel } from "./notifications/messages";
import { q3 } from "@/lib/num";

const KIND_TX: Record<AdjustmentKind, TxType> = {
  DAMAGED: "DAMAGED",
  EXPIRED: "EXPIRED",
  MISSING: "ADJUSTMENT",
  CORRECTION: "ADJUSTMENT",
};

const KIND_LABEL: Record<AdjustmentKind, { ar: string; en: string }> = {
  DAMAGED: { ar: "تالف", en: "Damaged" },
  EXPIRED: { ar: "منتهي الصلاحية", en: "Expired" },
  MISSING: { ar: "مفقود", en: "Missing" },
  CORRECTION: { ar: "تصحيح", en: "Correction" },
};

export interface AdjustmentInput {
  branchId?: string | null;
  productId: string;
  kind: AdjustmentKind;
  /** Positive magnitude for damaged/expired/missing; signed for corrections. */
  quantity: number;
  reason: string;
  notes?: string | null;
  attachmentId?: string | null;
  idempotencyKey?: string | null;
}

/** Quantity as the ledger expects it: magnitude for typed outflows, signed for adjustments. */
function ledgerQty(kind: AdjustmentKind, signedQty: number) {
  return KIND_TX[kind] === "ADJUSTMENT" ? signedQty : Math.abs(signedQty);
}

function signed(kind: AdjustmentKind, qty: number) {
  return kind === "CORRECTION" ? q3(qty) : -Math.abs(q3(qty));
}

export async function requestAdjustment(actor: Actor, input: AdjustmentInput) {
  requirePermission(actor, "adjustments.request");
  if (!input.reason?.trim()) throw new AppError("reason_required");
  if (!input.quantity || !Number.isFinite(input.quantity)) throw new AppError("quantity_invalid");
  const branchId = workingBranch(actor, input.branchId);
  const product = await db.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound();
  if (input.attachmentId) {
    const att = await db.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!att || att.uploadedById !== actor.id) throw notFound();
  }
  if (input.idempotencyKey) {
    const dup = await db.idempotencyKey.findUnique({ where: { key: input.idempotencyKey } });
    if (dup) return { replayed: true, id: (dup.result as { id?: string } | null)?.id ?? null, autoApproved: false };
  }

  const selfApprove = can(actor, "adjustments.approve") && hasBranchAccess(actor, branchId);
  const qty = signed(input.kind, input.quantity);

  try {
    return await withTx(undefined, async (tx) => {
      const req = await tx.stockAdjustmentRequest.create({
        data: {
          branchId,
          productId: input.productId,
          kind: input.kind,
          quantity: qty,
          reason: input.reason.trim(),
          notes: input.notes || null,
          attachmentId: input.attachmentId || null,
          requestedById: actor.id,
          ...(selfApprove ? { status: "APPROVED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: "self-approved" } : {}),
        },
      });
      if (input.idempotencyKey) {
        await tx.idempotencyKey.create({ data: { key: input.idempotencyKey, userId: actor.id, scope: "adjustment", result: { id: req.id } } });
      }
      await recordEvent(tx, { entityType: "adjustment", entityId: req.id, to: req.status, userId: actor.id, note: input.reason });
      if (selfApprove) {
        await postMovements(actor, {
          branchId,
          lines: [{ productId: input.productId, type: KIND_TX[input.kind], quantity: ledgerQty(input.kind, qty), unit: product.baseUnit, reason: input.reason, notes: input.notes, adjustmentId: req.id, attachmentId: input.attachmentId }],
        }, tx);
      } else {
        const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
        for (const locale of ["ar", "en"] as const) {
          const ids = (await branchSupervisors(tx, [branchId])).filter((u) => u !== actor.id);
          const users = await tx.user.findMany({ where: { id: { in: ids }, locale }, select: { id: true } });
          if (!users.length) continue;
          await notify(tx, {
            userIds: users.map((u) => u.id),
            type: "adjustment",
            key: "adjustment.pending",
            params: { user: actor.name, branch: branch.nameAr || branch.name, kind: KIND_LABEL[input.kind][locale], product: product.nameAr || product.name, qty },
            link: `/adjustments`,
            severity: "warning",
          });
        }
      }
      await audit(actor, {
        action: selfApprove ? "adjustment.post" : "adjustment.request",
        entityType: "adjustment",
        entityId: req.id,
        branchId,
        after: { productId: input.productId, kind: input.kind, quantity: qty, reason: input.reason },
      }, tx);
      return { replayed: false, id: req.id, autoApproved: selfApprove };
    });
  } catch (e) {
    if (input.idempotencyKey && isUniqueViolation(e, "key")) return { replayed: true, id: null, autoApproved: false };
    throw e;
  }
}

export async function reviewAdjustment(actor: Actor, id: string, approve: boolean, note?: string | null) {
  requirePermission(actor, "adjustments.approve");
  return withTx(undefined, async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_adjustment_requests WHERE id = ${id} FOR UPDATE`;
    const req = await tx.stockAdjustmentRequest.findUnique({ where: { id }, include: { product: true } });
    if (!req) throw notFound();
    assertBranchAccess(actor, req.branchId);
    if (req.status !== "PENDING") throw new AppError("already_reviewed");
    if (!approve && !note?.trim()) throw new AppError("reason_required");
    const status: ApprovalStatus = approve ? "APPROVED" : "REJECTED";
    await tx.stockAdjustmentRequest.update({
      where: { id },
      data: { status, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note || null },
    });
    if (approve) {
      await postMovements(actor, {
        branchId: req.branchId,
        lines: [{
          productId: req.productId,
          type: KIND_TX[req.kind],
          quantity: ledgerQty(req.kind, Number(req.quantity)),
          unit: req.product.baseUnit,
          reason: req.reason,
          notes: req.notes,
          adjustmentId: req.id,
          attachmentId: req.attachmentId,
        }],
      }, tx);
    }
    await recordEvent(tx, { entityType: "adjustment", entityId: id, from: "PENDING", to: status, userId: actor.id, note });
    await audit(actor, { action: approve ? "adjustment.approve" : "adjustment.reject", entityType: "adjustment", entityId: id, branchId: req.branchId, summary: note ?? undefined }, tx);
    const requester = await tx.user.findUnique({ where: { id: req.requestedById } });
    if (requester) {
      await notify(tx, {
        userIds: [requester.id],
        type: "adjustment",
        key: "adjustment.reviewed",
        params: { status: statusLabel(status, requester.locale), product: req.product.nameAr || req.product.name, qty: Number(req.quantity), note: note || "" },
        link: `/record/history`,
        severity: approve ? "success" : "warning",
      });
    }
  });
}

export async function listAdjustments(actor: Actor, f: { status?: ApprovalStatus; branchId?: string; mine?: boolean; page?: number } = {}) {
  if (f.mine) requirePermission(actor, "adjustments.request");
  else requirePermission(actor, "adjustments.approve");
  if (f.branchId) assertBranchAccess(actor, f.branchId);
  const where: P.StockAdjustmentRequestWhereInput = {
    ...(f.mine ? { requestedById: actor.id } : branchWhere(actor)),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.stockAdjustmentRequest.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, nameAr: true, sku: true, baseUnit: true } },
        branch: { select: { id: true, name: true, nameAr: true, code: true } },
        requestedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
        attachment: { select: { id: true, fileName: true, mimeType: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.stockAdjustmentRequest.count({ where }),
  ]);
  return { rows, total, page, pageSize: 30 };
}
