import type { Prisma as P, Settings } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { assertBranchAccess, requirePermission, type Actor } from "./rbac";
import { audit, diff } from "./audit";
import { getSettings } from "./settings";

export async function branchRecentTransactions(actor: Actor, branchId: string, take = 15) {
  requirePermission(actor, "transactions.view");
  assertBranchAccess(actor, branchId);
  return db.inventoryTransaction.findMany({
    where: { branchId },
    include: {
      product: { select: { id: true, name: true, nameAr: true, sku: true, baseUnit: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { seq: "desc" },
    take,
  });
}

/** Active managers (for the branch manager select). */
export async function managerOptions(actor: Actor) {
  requirePermission(actor, "branches.manage");
  return db.user.findMany({ where: { role: { in: ["MANAGER", "OWNER"] }, status: "ACTIVE" }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
}

export async function supplierOptions(actor: Actor) {
  requirePermission(actor, "users.manage");
  return db.supplier.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
}

export async function supplierOpenRequests(actor: Actor, supplierId: string) {
  requirePermission(actor, "replenishment.view");
  const scope = actor.role === "OWNER" ? {} : { branchId: { in: actor.branchIds } };
  return db.replenishmentRequest.findMany({
    where: { supplierId, ...scope, status: { in: ["APPROVED", "SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"] } },
    include: { branch: { select: { code: true, name: true, nameAr: true } }, items: { select: { requestedQty: true, receivedQty: true, unitCost: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export type SettingsInput = Omit<Settings, "id" | "updatedAt" | "currency">;

export async function updateSettings(actor: Actor, input: SettingsInput) {
  requirePermission(actor, "settings.manage");
  if (!input.businessName.trim()) throw new AppError("name_required");
  if (input.criticalPercent < 1 || input.criticalPercent > 100) throw new AppError("value_out_of_range");
  if (input.consumptionWindowDays < 1 || input.consumptionWindowDays > 365) throw new AppError("value_out_of_range");
  if (input.safetyDays < 0 || input.safetyDays > 90) throw new AppError("value_out_of_range");
  const before = await getSettings();
  await db.settings.update({ where: { id: 1 }, data: input });
  const d = diff(before as unknown as Record<string, unknown>, input as unknown as Record<string, unknown>);
  if (d.changed) await audit(actor, { action: "settings.update", entityType: "settings", entityId: "1", before: d.before, after: d.after });
}

export async function recentDeliveries(actor: Actor, take = 50) {
  requirePermission(actor, "settings.manage");
  return db.notificationDelivery.findMany({
    include: { notification: { select: { title: true, user: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  branchId?: string;
  from?: Date;
  to?: Date;
  page?: number;
}

export async function listAuditLogs(actor: Actor, f: AuditFilters) {
  requirePermission(actor, "audit.view");
  const where: P.AuditLogWhereInput = {
    ...(f.action ? { action: { contains: f.action, mode: "insensitive" } } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
  };
  const page = Math.max(1, f.page ?? 1);
  const pageSize = 50;
  const [rows, total, entityTypes, users] = await Promise.all([
    db.auditLog.findMany({ where, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { rows, total, page, pageSize, entityTypes: entityTypes.map((e) => e.entityType), users };
}

export async function listMyNotifications(actor: Actor, f: { unread?: boolean; page?: number }) {
  const where: P.NotificationWhereInput = { userId: actor.id, ...(f.unread ? { readAt: null } : {}) };
  const page = Math.max(1, f.page ?? 1);
  const pageSize = 30;
  const [rows, total, unread] = await Promise.all([
    db.notification.findMany({ where, include: { deliveries: { select: { id: true, channel: true, status: true, lastError: true, sentAt: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { rows, total, unread, page, pageSize };
}

export async function markNotificationsRead(actor: Actor, id?: string) {
  await db.notification.updateMany({ where: { userId: actor.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}

export async function getProfile(actor: Actor) {
  return db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      name: true, email: true, phone: true, locale: true, role: true, notifyEmail: true, notifyWhatsapp: true, notifySms: true, lastLoginAt: true,
      branches: { include: { branch: { select: { code: true, name: true, nameAr: true } } } },
      supplier: { select: { name: true } },
    },
  });
}
