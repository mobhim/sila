import { api } from "@/server/api";
import { findByBarcode } from "@/server/inventory/queries";
import { workingBranch } from "@/server/rbac";

/** GET /api/products/barcode?code=&branchId= — resolve a scanned code to product + unit. */
export async function GET(req: Request) {
  return api(async (actor) => {
    const u = new URL(req.url);
    const branchId = workingBranch(actor, u.searchParams.get("branchId"));
    return { match: await findByBarcode(actor, branchId, (u.searchParams.get("code") ?? "").slice(0, 64)) };
  });
}
