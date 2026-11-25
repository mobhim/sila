import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { listCategories, listProducts } from "@/server/products";
import { listSuppliers } from "@/server/suppliers";
import { getFmt } from "@/i18n/server";
import { Badge, ButtonLink, Card, EmptyState, Input, PageHeader, Select, Button } from "@/components/ui";
import { Pagination } from "@/components/ui/nav";
import { pname } from "@/components/status";

export const metadata = { title: "Products" };

type SP = Record<string, string | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor("products.view");
  const sp = await searchParams;
  const f = await getFmt();
  const { t, locale } = f;
  const status = sp.status === "INACTIVE" || sp.status === "ALL" ? sp.status : "ACTIVE";
  const [data, categories, suppliers] = await Promise.all([
    listProducts(actor, { q: sp.q, categoryId: sp.categoryId, supplierId: sp.supplierId, status, page: Number(sp.page) || 1 }),
    listCategories(),
    can(actor, "suppliers.view") ? listSuppliers(actor, { includeInactive: true }) : Promise.resolve([]),
  ]);
  const manage = can(actor, "products.manage");
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader
        title={t("products.title")}
        description={t("products.subtitle")}
        actions={
          manage ? (
            <>
              <ButtonLink href="/products/categories" variant="secondary">{t("products.categories")}</ButtonLink>
              <ButtonLink href="/products/new">{t("products.new")}</ButtonLink>
            </>
          ) : null
        }
      />
      <Card>
        <form className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]" method="get">
          <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder={t("products.searchPlaceholder")} aria-label={t("common.search")} />
          <Select name="categoryId" defaultValue={sp.categoryId ?? ""} aria-label={t("common.category")}>
            <option value="">{t("products.allCategories")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{pname(c, locale)}</option>)}
          </Select>
          {suppliers.length ? (
            <Select name="supplierId" defaultValue={sp.supplierId ?? ""} aria-label={t("common.supplier")}>
              <option value="">{t("products.allSuppliers")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          ) : <span className="hidden lg:block" />}
          <Select name="status" defaultValue={status} aria-label={t("common.status")}>
            <option value="ACTIVE">{t("enums.recordStatus.ACTIVE")}</option>
            <option value="INACTIVE">{t("enums.recordStatus.INACTIVE")}</option>
            <option value="ALL">{t("products.statusAll")}</option>
          </Select>
          <Button type="submit" variant="secondary">{t("common.filter")}</Button>
        </form>
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("products.col.product")}</th>
                  <th>{t("products.col.category")}</th>
                  <th>{t("products.col.supplier")}</th>
                  <th>{t("products.col.unit")}</th>
                  <th className="text-end">{t("products.col.cost")}</th>
                  <th className="text-end">{t("products.col.stock")}</th>
                  <th>{t("products.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id}>
                    <td className="min-w-56">
                      <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                        {p.imageId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/files/${p.imageId}`} alt="" className="size-9 shrink-0 rounded-md border border-slate-200 object-cover" loading="lazy" />
                        ) : (
                          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-400">{p.sku.slice(0, 2)}</span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-800 hover:text-brand-700">{pname(p, locale)}</span>
                          <span className="block truncate font-mono text-xs text-slate-400" dir="ltr">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-slate-600">{p.category ? pname(p.category, locale) : "—"}</td>
                    <td className="text-slate-600">{p.supplier?.name ?? "—"}</td>
                    <td className="text-slate-600">{t(`enums.unit.${p.baseUnit}`)}</td>
                    <td className="tnum text-end">{f.money(Number(p.costPrice))}</td>
                    <td className="tnum text-end font-medium">{f.num(p.totalQty)}</td>
                    <td><Badge tone={p.status === "ACTIVE" ? "green" : "gray"}>{t(`enums.recordStatus.${p.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("products.empty")} description={t("products.emptyHint")} action={manage ? <ButtonLink href="/products/new">{t("products.new")}</ButtonLink> : null} />
        )}
        <Pagination
          path="/products"
          params={sp}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          labels={{ prev: t("common.prev"), next: t("common.next"), summary: `${t("common.results", { n: f.num(data.total) })} · ${t("common.page", { page: data.page, pages })}` }}
        />
      </Card>
    </>
  );
}
