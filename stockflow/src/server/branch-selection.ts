import "server-only";
import { cookies } from "next/headers";
import { hasBranchAccess, type Actor } from "./rbac";

export const BRANCH_COOKIE = "sf_branch";

/**
 * The branch filter chosen in the top bar: a branch id, or null for "all branches".
 * Employees are always pinned to their own branch.
 */
export async function getSelectedBranch(actor: Actor, override?: string | null): Promise<string | null> {
  if (actor.role === "EMPLOYEE") return actor.primaryBranchId;
  const v = override ?? (await cookies()).get(BRANCH_COOKIE)?.value ?? null;
  if (!v || v === "all") return actor.role === "MANAGER" && actor.branchIds.length === 1 ? actor.branchIds[0] : null;
  return hasBranchAccess(actor, v) ? v : null;
}
