import { randomBytes } from "node:crypto";
import type { Role, UserStatus, Prisma as P } from "@prisma/client";
import { db } from "./db";
import { AppError, forbidden, isUniqueViolation, notFound } from "./errors";
import { branchScope, requirePermission, type Actor } from "./rbac";
import { audit } from "./audit";
import { hashPassword, passwordProblem, verifyPassword } from "./auth/password";
import { revokeUserSessions } from "./auth/session";

export interface UserInput {
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  status: UserStatus;
  locale: "ar" | "en";
  supplierId?: string | null;
  branchIds: string[];
  primaryBranchId?: string | null;
}

/** Managers may only manage employees within their branches. */
function assertCanManage(actor: Actor, role: Role, branchIds: string[]) {
  requirePermission(actor, "users.manage");
  if (actor.role === "OWNER") return;
  if (role !== "EMPLOYEE") throw forbidden();
  const scope = branchScope(actor);
  if (scope !== "ALL" && branchIds.some((b) => !scope.includes(b))) throw forbidden();
}

export async function listUsers(actor: Actor, f: { q?: string; role?: Role; branchId?: string; status?: UserStatus } = {}) {
  requirePermission(actor, "users.view");
  const scope = branchScope(actor);
  const where: P.UserWhereInput = {
    ...(actor.role === "OWNER" ? {} : { role: "EMPLOYEE", branches: { some: { branchId: { in: scope === "ALL" ? [] : scope } } } }),
    ...(f.role ? { role: f.role } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.branchId ? { branches: { some: { branchId: f.branchId } } } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  return db.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true, createdAt: true,
      supplier: { select: { id: true, name: true } },
      branches: { include: { branch: { select: { id: true, code: true, name: true, nameAr: true } } } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function getUser(actor: Actor, id: string) {
  requirePermission(actor, "users.view");
  const u = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, phone: true, role: true, status: true, locale: true, supplierId: true, lastLoginAt: true, createdAt: true,
      branches: { select: { branchId: true, isPrimary: true } },
    },
  });
  if (!u) throw notFound();
  if (actor.role !== "OWNER") {
    const scope = branchScope(actor);
    if (u.role !== "EMPLOYEE" || scope === "ALL" || !u.branches.some((b) => scope.includes(b.branchId))) throw notFound();
  }
  return u;
}

function validate(i: UserInput) {
  if (!i.name.trim()) throw new AppError("name_required");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) throw new AppError("email_invalid");
  if (i.role === "SUPPLIER" && !i.supplierId) throw new AppError("supplier_required");
  if ((i.role === "EMPLOYEE" || i.role === "MANAGER") && !i.branchIds.length) throw new AppError("branch_required");
  if (i.role === "EMPLOYEE" && i.branchIds.length > 1) throw new AppError("employee_one_branch");
}

export function temporaryPassword() {
  // 14 chars, letters and digits, without look-alikes.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s.slice(0, 10) + String(2 + (bytes[0] % 8)) + s.slice(11);
}

export async function createUser(actor: Actor, i: UserInput) {
  validate(i);
  assertCanManage(actor, i.role, i.branchIds);
  const temp = temporaryPassword();
  const branches = i.role === "OWNER" || i.role === "SUPPLIER" ? [] : i.branchIds;
  const primary = i.primaryBranchId && branches.includes(i.primaryBranchId) ? i.primaryBranchId : branches[0];
  try {
    const u = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: i.name.trim(),
          email: i.email.trim().toLowerCase(),
          phone: i.phone?.trim() || null,
          role: i.role,
          status: i.status,
          locale: i.locale,
          supplierId: i.role === "SUPPLIER" ? i.supplierId! : null,
          passwordHash: await hashPassword(temp),
          mustChangePassword: true,
          branches: { create: branches.map((b) => ({ branchId: b, isPrimary: b === primary })) },
        },
      });
      await audit(actor, { action: "user.create", entityType: "user", entityId: u.id, summary: u.email, after: { role: i.role, branchIds: branches, supplierId: i.supplierId } }, tx);
      return u;
    });
    return { user: u, temporaryPassword: temp };
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new AppError("email_taken");
    throw e;
  }
}

export async function updateUser(actor: Actor, id: string, i: UserInput) {
  validate(i);
  const before = await db.user.findUnique({ where: { id }, include: { branches: true } });
  if (!before) throw notFound();
  assertCanManage(actor, before.role, before.branches.map((b) => b.branchId));
  assertCanManage(actor, i.role, i.branchIds);
  if (id === actor.id && (i.role !== before.role || i.status !== "ACTIVE")) throw new AppError("cannot_change_self");
  if (before.role === "OWNER" && (i.role !== "OWNER" || i.status !== "ACTIVE")) {
    const owners = await db.user.count({ where: { role: "OWNER", status: "ACTIVE", NOT: { id } } });
    if (!owners) throw new AppError("last_owner");
  }
  const branches = i.role === "OWNER" || i.role === "SUPPLIER" ? [] : i.branchIds;
  const primary = i.primaryBranchId && branches.includes(i.primaryBranchId) ? i.primaryBranchId : branches[0];
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name: i.name.trim(),
          email: i.email.trim().toLowerCase(),
          phone: i.phone?.trim() || null,
          role: i.role,
          status: i.status,
          locale: i.locale,
          supplierId: i.role === "SUPPLIER" ? i.supplierId! : null,
        },
      });
      await tx.branchUser.deleteMany({ where: { userId: id } });
      if (branches.length) await tx.branchUser.createMany({ data: branches.map((b) => ({ userId: id, branchId: b, isPrimary: b === primary })) });
      const prevBranches = before.branches.map((b) => b.branchId).sort().join(",");
      const permissionChange = before.role !== i.role || prevBranches !== [...branches].sort().join(",") || before.status !== i.status;
      await audit(actor, {
        action: permissionChange ? "user.permissions" : "user.update",
        entityType: "user",
        entityId: id,
        summary: i.email,
        before: { role: before.role, status: before.status, branchIds: prevBranches },
        after: { role: i.role, status: i.status, branchIds: branches.join(",") },
      }, tx);
    });
  } catch (e) {
    if (isUniqueViolation(e, "email")) throw new AppError("email_taken");
    throw e;
  }
  if (i.status !== "ACTIVE" || before.role !== i.role) await revokeUserSessions(id);
}

export async function resetPassword(actor: Actor, id: string) {
  const u = await db.user.findUnique({ where: { id }, include: { branches: true } });
  if (!u) throw notFound();
  assertCanManage(actor, u.role, u.branches.map((b) => b.branchId));
  const temp = temporaryPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true } });
  await revokeUserSessions(id);
  await audit(actor, { action: "user.reset_password", entityType: "user", entityId: id, summary: u.email });
  return temp;
}

export async function changeOwnPassword(actor: Actor, current: string, next: string, keepToken?: string | null) {
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(current, u.passwordHash))) throw new AppError("password_wrong");
  const problem = passwordProblem(next);
  if (problem) throw new AppError(problem);
  if (current === next) throw new AppError("password_same");
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await revokeUserSessions(actor.id, keepToken);
  await audit(actor, { action: "user.change_password", entityType: "user", entityId: actor.id });
}

export async function updateProfile(
  actor: Actor,
  i: { name: string; phone?: string | null; locale: "ar" | "en"; notifyEmail: boolean; notifyWhatsapp: boolean; notifySms: boolean },
) {
  if (!i.name.trim()) throw new AppError("name_required");
  await db.user.update({
    where: { id: actor.id },
    data: { name: i.name.trim(), phone: i.phone?.trim() || null, locale: i.locale, notifyEmail: i.notifyEmail, notifyWhatsapp: i.notifyWhatsapp, notifySms: i.notifySms },
  });
}
