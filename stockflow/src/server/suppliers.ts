import type { RecordStatus } from "@prisma/client";
import { db } from "./db";
import { AppError, isUniqueViolation, notFound } from "./errors";
import { branchWhere, requirePermission, type Actor } from "./rbac";
import { audit, diff } from "./audit";

export interface SupplierInput {
  code: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  vatNumber?: string | null;
  leadTimeDays: number;
  status: RecordStatus;
  notes?: string | null;
}

export async function listSuppliers(actor: Actor, opts: { q?: string; includeInactive?: boolean } = {}) {
  requirePermission(actor, "suppliers.view");
  return db.supplier.findMany({
    where: {
      ...(opts.includeInactive ? {} : { status: "ACTIVE" }),
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { code: { contains: opts.q, mode: "insensitive" } }] } : {}),
    },
    include: { _count: { select: { products: true, users: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getSupplier(actor: Actor, id: string) {
  requirePermission(actor, "suppliers.view");
  const s = await db.supplier.findUnique({
    where: { id },
    include: { users: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } }, products: { select: { id: true, sku: true, name: true, nameAr: true } } },
  });
  if (!s) throw notFound();
  return s;
}

function validate(i: SupplierInput) {
  if (!/^[A-Za-z0-9-_]{2,20}$/.test(i.code)) throw new AppError("code_invalid");
  if (!i.name.trim()) throw new AppError("name_required");
  if (!(i.leadTimeDays >= 0 && i.leadTimeDays <= 365)) throw new AppError("value_out_of_range");
}

export async function saveSupplier(actor: Actor, id: string | null, i: SupplierInput) {
  requirePermission(actor, "suppliers.manage");
  validate(i);
  try {
    if (!id) {
      const s = await db.supplier.create({ data: { ...i, code: i.code.toUpperCase() } });
      await audit(actor, { action: "supplier.create", entityType: "supplier", entityId: s.id, after: i });
      return s;
    }
    const before = await db.supplier.findUnique({ where: { id } });
    if (!before) throw notFound();
    const s = await db.supplier.update({ where: { id }, data: { ...i, code: i.code.toUpperCase() } });
    const d = diff(before as unknown as Record<string, unknown>, i as unknown as Record<string, unknown>);
    if (d.changed) await audit(actor, { action: "supplier.update", entityType: "supplier", entityId: id, before: d.before, after: d.after });
    return s;
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new AppError("code_taken");
    throw e;
  }
}

/** Delivery performance: on-time rate, fill rate, average lead time. */
export async function supplierPerformance(actor: Actor, from: Date, to: Date, supplierId?: string) {
  requirePermission(actor, "reports.view");
  const reqs = await db.replenishmentRequest.findMany({
    where: {
      ...branchWhere(actor),
      supplierId: supplierId ?? { not: null },
      sentAt: { gte: from, lte: to },
    },
    include: { supplier: { select: { id: true, name: true, leadTimeDays: true } }, items: true, receipts: { select: { createdAt: true } } },
  });
  const by = new Map<string, { supplierId: string; name: string; promisedLead: number; requests: number; completed: number; declinedOrCancelled: number; requestedQty: number; receivedQty: number; leadDays: number[]; onTime: number; withExpected: number }>();
  for (const r of reqs) {
    if (!r.supplier) continue;
    const e = by.get(r.supplier.id) ?? { supplierId: r.supplier.id, name: r.supplier.name, promisedLead: r.supplier.leadTimeDays, requests: 0, completed: 0, declinedOrCancelled: 0, requestedQty: 0, receivedQty: 0, leadDays: [], onTime: 0, withExpected: 0 };
    e.requests++;
    if (r.status === "RECEIVED") e.completed++;
    if (r.status === "CANCELLED") e.declinedOrCancelled++;
    for (const it of r.items) {
      e.requestedQty += Number(it.requestedQty);
      e.receivedQty += Number(it.receivedQty);
    }
    const first = r.receipts.map((x) => x.createdAt.getTime()).sort()[0];
    if (first && r.sentAt) e.leadDays.push((first - r.sentAt.getTime()) / 86400000);
    if (first && r.expectedAt) {
      e.withExpected++;
      if (first <= r.expectedAt.getTime() + 86400000) e.onTime++;
    }
    by.set(r.supplier.id, e);
  }
  return [...by.values()].map((e) => ({
    supplierId: e.supplierId,
    name: e.name,
    promisedLeadDays: e.promisedLead,
    requests: e.requests,
    completed: e.completed,
    cancelled: e.declinedOrCancelled,
    fillRate: e.requestedQty > 0 ? e.receivedQty / e.requestedQty : null,
    avgLeadDays: e.leadDays.length ? e.leadDays.reduce((a, b) => a + b, 0) / e.leadDays.length : null,
    onTimeRate: e.withExpected ? e.onTime / e.withExpected : null,
  }));
}
