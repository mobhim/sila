import type { ReplenishmentStatus, Prisma as P } from "@prisma/client";
import { db } from "./db";
import { assertBranchAccess, branchWhere, requirePermission, type Actor } from "./rbac";
import { AppError } from "./errors";

/** Replenishment list supporting several statuses at once (tabs). */
export async function listRequestsByStatuses(
  actor: Actor,
  f: { branchId?: string | null; statuses?: ReplenishmentStatus[]; page?: number; pageSize?: number },
) {
  requirePermission(actor, "replenishment.view");
  if (f.branchId) assertBranchAccess(actor, f.branchId);
  const where: P.ReplenishmentRequestWhereInput = {
    ...branchWhere(actor),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.statuses?.length ? { status: { in: f.statuses } } : {}),
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

/** Number of active portal accounts for a supplier (to warn before sending). */
export async function supplierPortalUserCount(supplierId: string) {
  return db.user.count({ where: { supplierId, role: "SUPPLIER", status: "ACTIVE" } });
}

/** Active suppliers for selectors (staff with replenishment access). */
export async function supplierOptions(actor: Actor) {
  requirePermission(actor, "replenishment.view");
  return db.supplier.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true, leadTimeDays: true }, orderBy: { name: "asc" } });
}

/** The signed-in user's own notifications (used by the supplier portal). */
export async function myNotifications(actor: Actor, take = 100) {
  return db.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take });
}

export async function markMyNotificationsRead(actor: Actor, id?: string | null) {
  if (id) {
    const n = await db.notification.findUnique({ where: { id } });
    if (!n || n.userId !== actor.id) throw new AppError("not_found", {}, 404);
    await db.notification.update({ where: { id }, data: { readAt: n.readAt ?? new Date() } });
  } else {
    await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
  }
}

/** Current balance of some products in a branch (for editors and approvers). */
export async function stockFor(actor: Actor, branchId: string, productIds: string[]) {
  assertBranchAccess(actor, branchId);
  const rows = await db.branchInventory.findMany({
    where: { branchId, productId: { in: productIds } },
    select: { productId: true, quantity: true, reserved: true },
  });
  return new Map(rows.map((r) => [r.productId, Number(r.quantity) - Number(r.reserved)]));
}
