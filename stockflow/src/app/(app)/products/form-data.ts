import type { Actor } from "@/server/rbac";
import { listCategories } from "@/server/products";
import { listSuppliers } from "@/server/suppliers";
import { pname } from "@/components/status";

/** Option lists for the product form. */
export async function productFormOptions(actor: Actor, locale: string) {
  const [categories, suppliers] = await Promise.all([listCategories(), listSuppliers(actor, { includeInactive: true })]);
  return {
    categories: categories.map((c) => ({ id: c.id, label: pname(c, locale) })),
    suppliers: suppliers.map((s) => ({ id: s.id, label: `${s.name} · ${s.code}` })),
  };
}
