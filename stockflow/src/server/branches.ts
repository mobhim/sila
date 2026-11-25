import type { BranchStatus } from "@prisma/client";
import { db } from "./db";
import { AppError, isUniqueViolation, notFound } from "./errors";
import { assertBranchAccess, branchScope, requirePermission, type Actor } from "./rbac";
import { audit, diff } from "./audit";

export interface BranchInput {
  code: string;
  name: string;
  nameAr?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  managerId?: string | null;
  status: BranchStatus;
  autoDraftReplenishment: boolean;
  reviewPeriodDays: number;
}

export async function listBranches(actor: Actor, opts: { includeInactive?: boolean } = {}) {
  requirePermission(actor, "branches.view");
  const scope = branchScope(actor);
  return db.branch.findMany({
    where: { ...(scope === "ALL" ? {} : { id: { in: scope } }), ...(opts.includeInactive ? {} : { status: "ACTIVE" }) },
    include: { manager: { select: { id: true, name: true } }, _count: { select: { users: true, inventory: true } } },
    orderBy: { code: "asc" },
  });
}

/** Lightweight list for selectors (any staff with branch scope). */
export async function branchOptions(actor: Actor) {
  const scope = branchScope(actor);
  return db.branch.findMany({
    where: { ...(scope === "ALL" ? {} : { id: { in: scope } }), status: "ACTIVE" },
    select: { id: true, code: true, name: true, nameAr: true },
    orderBy: { code: "asc" },
  });
}

/** All active branches (for choosing a transfer source). Names only. */
export async function allBranchOptions(actor: Actor) {
  requirePermission(actor, "transfers.manage");
  return db.branch.findMany({ where: { status: "ACTIVE" }, select: { id: true, code: true, name: true, nameAr: true }, orderBy: { code: "asc" } });
}

export async function getBranch(actor: Actor, id: string) {
  requirePermission(actor, "branches.view");
  assertBranchAccess(actor, id);
  const b = await db.branch.findUnique({
    where: { id },
    include: {
      manager: { select: { id: true, name: true, email: true, phone: true } },
      users: { include: { user: { select: { id: true, name: true, email: true, role: true, status: true } } } },
    },
  });
  if (!b) throw notFound();
  return b;
}

function validate(i: BranchInput) {
  if (!/^[A-Za-z0-9-_]{2,20}$/.test(i.code)) throw new AppError("code_invalid");
  if (!i.name.trim()) throw new AppError("name_required");
  if (!(i.reviewPeriodDays >= 0 && i.reviewPeriodDays <= 90)) throw new AppError("value_out_of_range");
}

export async function createBranch(actor: Actor, i: BranchInput) {
  requirePermission(actor, "branches.manage");
  validate(i);
  try {
    return await db.$transaction(async (tx) => {
      const b = await tx.branch.create({ data: { ...i, code: i.code.toUpperCase() } });
      if (i.managerId) {
        await tx.branchUser.upsert({
          where: { userId_branchId: { userId: i.managerId, branchId: b.id } },
          create: { userId: i.managerId, branchId: b.id },
          update: {},
        });
      }
      await audit(actor, { action: "branch.create", entityType: "branch", entityId: b.id, branchId: b.id, after: i }, tx);
      return b;
    });
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new AppError("code_taken");
    throw e;
  }
}

export async function updateBranch(actor: Actor, id: string, i: BranchInput) {
  requirePermission(actor, "branches.manage");
  validate(i);
  const before = await db.branch.findUnique({ where: { id } });
  if (!before) throw notFound();
  try {
    return await db.$transaction(async (tx) => {
      const b = await tx.branch.update({ where: { id }, data: { ...i, code: i.code.toUpperCase() } });
      if (i.managerId) {
        await tx.branchUser.upsert({
          where: { userId_branchId: { userId: i.managerId, branchId: id } },
          create: { userId: i.managerId, branchId: id },
          update: {},
        });
      }
      const d = diff(before as unknown as Record<string, unknown>, i as unknown as Record<string, unknown>);
      if (d.changed) await audit(actor, { action: "branch.update", entityType: "branch", entityId: id, branchId: id, before: d.before, after: d.after }, tx);
      return b;
    });
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new AppError("code_taken");
    throw e;
  }
}

/** A branch to show stock for when none is specified (owners have no primary branch). */
export async function defaultBranchFor(actor: Actor, requested?: string | null): Promise<string> {
  if (requested || actor.role !== "OWNER") {
    const { workingBranch } = await import("./rbac");
    return workingBranch(actor, requested);
  }
  const b = await db.branch.findFirst({ where: { status: "ACTIVE" }, orderBy: { code: "asc" }, select: { id: true } });
  if (!b) throw new AppError("branch_required");
  return b.id;
}
