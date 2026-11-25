import type { Role } from "@prisma/client";
import { AppError, forbidden } from "./errors";

/** The authenticated principal every service receives. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  locale: string;
  supplierId: string | null;
  /** Branches the user is assigned to (ignored for owners, who see all). */
  branchIds: string[];
  primaryBranchId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const PERMISSIONS = [
  "dashboard.view",
  "branches.view",
  "branches.manage",
  "products.view",
  "products.manage",
  "suppliers.view",
  "suppliers.manage",
  "inventory.view",
  "inventory.thresholds",
  "transactions.view",
  "transactions.viewOwn",
  "movements.record", // consumption, withdrawal, return
  "movements.receive", // free stock receipt
  "adjustments.request",
  "adjustments.approve",
  "alerts.view",
  "alerts.manage",
  "replenishment.view",
  "replenishment.manage",
  "replenishment.approve",
  "replenishment.receive",
  "transfers.view",
  "transfers.manage",
  "counts.view",
  "counts.enter",
  "counts.manage",
  "counts.approve",
  "reports.view",
  "users.view",
  "users.manage",
  "audit.view",
  "settings.manage",
  "supplier.portal",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = [
  "dashboard.view",
  "branches.view",
  "products.view",
  "suppliers.view",
  "inventory.view",
  "inventory.thresholds",
  "transactions.view",
  "transactions.viewOwn",
  "movements.record",
  "movements.receive",
  "adjustments.request",
  "adjustments.approve",
  "alerts.view",
  "alerts.manage",
  "replenishment.view",
  "replenishment.manage",
  "replenishment.approve",
  "replenishment.receive",
  "transfers.view",
  "transfers.manage",
  "counts.view",
  "counts.enter",
  "counts.manage",
  "counts.approve",
  "reports.view",
  "users.view",
  "users.manage",
];

const EMPLOYEE: Permission[] = [
  "products.view",
  "inventory.view",
  "transactions.viewOwn",
  "movements.record",
  "adjustments.request",
  "counts.view",
  "counts.enter",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(PERMISSIONS.filter((p) => p !== "supplier.portal")),
  MANAGER: new Set(MANAGER),
  EMPLOYEE: new Set(EMPLOYEE),
  SUPPLIER: new Set<Permission>(["supplier.portal"]),
};

export function can(actor: Pick<Actor, "role">, perm: Permission): boolean {
  return MATRIX[actor.role].has(perm);
}

export function requirePermission(actor: Actor, perm: Permission): void {
  if (!can(actor, perm)) throw forbidden();
}

export type BranchScope = "ALL" | string[];

/** Branch ids the actor may see. Employees are limited to their primary branch. */
export function branchScope(actor: Actor): BranchScope {
  if (actor.role === "OWNER") return "ALL";
  if (actor.role === "EMPLOYEE") return actor.primaryBranchId ? [actor.primaryBranchId] : [];
  if (actor.role === "MANAGER") return actor.branchIds;
  return [];
}

export function hasBranchAccess(actor: Actor, branchId: string): boolean {
  const scope = branchScope(actor);
  return scope === "ALL" || scope.includes(branchId);
}

/** Throws not-found (not forbidden) so record ids from other branches leak nothing. */
export function assertBranchAccess(actor: Actor, branchId: string): void {
  if (!hasBranchAccess(actor, branchId)) throw new AppError("not_found", {}, 404);
}

/** Prisma `where` fragment for a branch-owned model. */
export function branchWhere(actor: Actor, field = "branchId"): Record<string, unknown> {
  const scope = branchScope(actor);
  return scope === "ALL" ? {} : { [field]: { in: scope } };
}

/** Narrow a requested branch filter to what the actor may see. */
export function resolveBranchFilter(actor: Actor, requested?: string | null): string[] | "ALL" {
  const scope = branchScope(actor);
  if (requested && requested !== "all") {
    if (scope !== "ALL" && !scope.includes(requested)) throw new AppError("not_found", {}, 404);
    return [requested];
  }
  return scope;
}

/** The branch an employee/manager works in when no branch is chosen explicitly. */
export function workingBranch(actor: Actor, requested?: string | null): string {
  if (actor.role === "EMPLOYEE") {
    if (!actor.primaryBranchId) throw new AppError("no_branch_assigned");
    return actor.primaryBranchId;
  }
  const id = requested || actor.primaryBranchId || (actor.role === "MANAGER" ? actor.branchIds[0] : null);
  if (!id) throw new AppError("branch_required");
  assertBranchAccess(actor, id);
  return id;
}
