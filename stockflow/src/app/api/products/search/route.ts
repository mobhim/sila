import { api } from "@/server/api";
import { searchProductsForBranch } from "@/server/inventory/queries";
import { workingBranch } from "@/server/rbac";

/** GET /api/products/search?q=&branchId= — active products with the branch's available stock. */
export async function GET(req: Request) {
  return api(async (actor) => {
    const u = new URL(req.url);
    const branchId = workingBranch(actor, u.searchParams.get("branchId"));
    const q = (u.searchParams.get("q") ?? "").slice(0, 80);
    return { products: await searchProductsForBranch(actor, branchId, q, 25) };
  });
}
