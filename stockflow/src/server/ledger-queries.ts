/** Read-only queries over the inventory ledger, branch-scoped. */
import type { TxType, Prisma as P } from "@prisma/client";
import { db } from "./db";
import { branchWhere, requirePermission, resolveBranchFilter, type Actor } from "./rbac";

export interface LedgerFilters {
  branchId?: string | null;
  productId?: string | null;
  type?: TxType | null;
  userId?: string | null;
  from?: Date | null;
  to?: Date | null;
  page?: number;
  pageSize?: number;
}

const include = {
  product: { select: { id: true, name: true, nameAr: true, sku: true, baseUnit: true } },
  branch: { select: { id: true, code: true, name: true, nameAr: true } },
  user: { select: { id: true, name: true } },
  attachment: { select: { id: true, fileName: true } },
  replenishment: { select: { id: true, seq: true } },
  transfer: { select: { id: true, seq: true } },
  count: { select: { id: true, seq: true } },
  adjustment: { select: { id: true, seq: true } },
} satisfies P.InventoryTransactionInclude;

export async function listTransactions(actor: Actor, f: LedgerFilters) {
  requirePermission(actor, "transactions.view");
  const branches = resolveBranchFilter(actor, f.branchId);
  const where: P.InventoryTransactionWhereInput = {
    ...(branches === "ALL" ? {} : { branchId: { in: branches } }),
    ...(f.productId ? { productId: f.productId } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
  };
  const pageSize = Math.min(f.pageSize ?? 50, 200);
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.inventoryTransaction.findMany({ where, include, orderBy: { seq: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.inventoryTransaction.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export type LedgerRow = Awaited<ReturnType<typeof listTransactions>>["rows"][number];

/** Users who appear in the actor's visible ledger (for the filter). */
export async function ledgerUsers(actor: Actor) {
  requirePermission(actor, "transactions.view");
  return db.user.findMany({
    where: { transactions: { some: branchWhere(actor) } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 300,
  });
}

/** Recent movements of one product within the actor's branches. */
export async function recentProductTransactions(actor: Actor, productId: string, take = 20) {
  requirePermission(actor, "transactions.view");
  return db.inventoryTransaction.findMany({
    where: { productId, ...branchWhere(actor) },
    include,
    orderBy: { seq: "desc" },
    take,
  });
}
