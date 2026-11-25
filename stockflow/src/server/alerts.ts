import type { AlertLevel, AlertStatus, Prisma as P } from "@prisma/client";
import { db, type Tx } from "./db";
import { AppError } from "./errors";
import { assertBranchAccess, branchWhere, requirePermission, type Actor } from "./rbac";
import { getSettings } from "./settings";
import { available, isMonitored, stockState } from "./inventory/calc";
import { recommendationFor } from "./inventory/recommend";
import { branchSupervisors, notify } from "./notifications";
import { ensureAutoDraft } from "./replenishment";
import { audit } from "./audit";
import { num } from "@/lib/num";

const SEVERITY: Record<AlertLevel, number> = { LOW: 1, CRITICAL: 2, OUT_OF_STOCK: 3 };

/**
 * Re-evaluate the alert for one inventory row. Called by the ledger inside the movement
 * transaction (the row is already locked) and after threshold changes.
 */
export async function evaluateAlert(tx: Tx, inventoryId: string, actor: Actor | null) {
  const inv = await tx.branchInventory.findUniqueOrThrow({
    where: { id: inventoryId },
    include: { product: { include: { units: true, supplier: true } }, branch: true },
  });
  const settings = await getSettings(tx);
  const avail = available(num(inv.quantity), num(inv.reserved));
  const min = num(inv.minStock);
  const state = stockState(avail, min, inv.criticalStock === null ? null : num(inv.criticalStock), settings.criticalPercent);

  const open = await tx.stockAlert.findFirst({
    where: { branchId: inv.branchId, productId: inv.productId, status: { not: "RESOLVED" } },
  });

  if (!isMonitored(min) || state === "NORMAL" || inv.product.status !== "ACTIVE" || inv.branch.status !== "ACTIVE") {
    if (open) {
      await tx.stockAlert.update({
        where: { id: open.id },
        data: { status: "RESOLVED", resolvedAt: new Date(), currentQuantity: avail },
      });
    }
    return null;
  }

  const level = state as AlertLevel;
  const rec = await recommendationFor(tx, inv, inv.branch.reviewPeriodDays, settings);
  const params = {
    product: inv.product.nameAr || inv.product.name,
    branch: inv.branch.nameAr || inv.branch.name,
    qty: avail,
    min,
    rec: rec.recommended,
  };
  const link = `/alerts?branch=${inv.branchId}`;

  if (!open) {
    const alert = await tx.stockAlert.create({
      data: {
        branchId: inv.branchId,
        productId: inv.productId,
        level,
        quantityAtTrigger: avail,
        minStockAtTrigger: min,
        currentQuantity: avail,
        recommendedQty: rec.recommended,
      },
    });
    await notify(tx, {
      userIds: await branchSupervisors(tx, [inv.branchId]),
      type: "stock_alert",
      key: `alert.${level}`,
      params,
      severity: level === "LOW" ? "warning" : "critical",
      link,
      data: { alertId: alert.id, branchId: inv.branchId, productId: inv.productId },
      external: true,
    });
    if (settings.autoDraftReplenishment && inv.branch.autoDraftReplenishment) {
      await ensureAutoDraft(tx, { inv, alertId: alert.id, settings, actor });
    }
    return alert;
  }

  const escalated = SEVERITY[level] > SEVERITY[open.level];
  const updated = await tx.stockAlert.update({
    where: { id: open.id },
    data: {
      currentQuantity: avail,
      recommendedQty: rec.recommended,
      ...(level !== open.level ? { level, levelChangedAt: new Date() } : {}),
    },
  });
  if (escalated) {
    await notify(tx, {
      userIds: await branchSupervisors(tx, [inv.branchId]),
      type: "stock_alert",
      key: `alert.${level}`,
      params,
      severity: "critical",
      link,
      data: { alertId: open.id, branchId: inv.branchId, productId: inv.productId },
      external: true,
    });
  }
  return updated;
}

export interface AlertFilters {
  branchId?: string;
  productId?: string;
  level?: AlertLevel;
  status?: AlertStatus | "ACTIVE";
  page?: number;
  pageSize?: number;
}

export async function listAlerts(actor: Actor, f: AlertFilters) {
  requirePermission(actor, "alerts.view");
  if (f.branchId) assertBranchAccess(actor, f.branchId);
  const where: P.StockAlertWhereInput = {
    ...branchWhere(actor),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.productId ? { productId: f.productId } : {}),
    ...(f.level ? { level: f.level } : {}),
    ...(f.status === "ACTIVE" || !f.status ? { status: { not: "RESOLVED" } } : { status: f.status }),
  };
  const pageSize = Math.min(f.pageSize ?? 50, 200);
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.stockAlert.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, nameAr: true, sku: true, baseUnit: true } },
        branch: { select: { id: true, name: true, nameAr: true, code: true } },
        replenishment: { select: { id: true, seq: true, status: true } },
      },
      // Most severe first, then oldest.
      orderBy: [{ level: "desc" }, { triggeredAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.stockAlert.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function acknowledgeAlert(actor: Actor, alertId: string) {
  requirePermission(actor, "alerts.manage");
  const alert = await db.stockAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new AppError("not_found", {}, 404);
  assertBranchAccess(actor, alert.branchId);
  if (alert.status !== "OPEN") return alert;
  const updated = await db.stockAlert.update({
    where: { id: alertId },
    data: { status: "ACKNOWLEDGED", acknowledgedById: actor.id, acknowledgedAt: new Date() },
  });
  await audit(actor, { action: "alert.acknowledge", entityType: "stock_alert", entityId: alertId, branchId: alert.branchId });
  return updated;
}
