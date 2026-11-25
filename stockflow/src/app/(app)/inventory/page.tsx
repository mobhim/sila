import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { getSelectedBranch } from "@/server/branch-selection";
import { compareInventory, listInventory, type InventoryFilters } from "@/server/inventory/queries";
import { listCategories } from "@/server/products";
import type { StockState } from "@/server/inventory/calc";
import { getFmt, type Fmt } from "@/i18n/server";
import { Button, ButtonLink, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { Pagination, Tabs, withParams } from "@/components/ui/nav";
import { StockBadge, bname, pname } from "@/components/status";
import { cn } from "@/lib/cn";

export const metadata = { title: "Inventory" };

type SP = Record<string, string | undefined>;
const STATES: Record<string, InventoryFilters["state"]> = { attention: "ATTENTION", LOW: "LOW", CRITICAL: "CRITICAL", OUT_OF_STOCK: "OUT_OF_STOCK" };
const SORTS = ["state", "name", "available", "days", "value"] as const;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor("inventory.view");
  const sp = await searchParams;
  const f = await getFmt();
  const { t } = f;
  const branchId = await getSelectedBranch(actor);
  const compare = sp.view === "compare" && actor.role !== "EMPLOYEE";
  const categories = await listCategories();

  const viewTabs = actor.role !== "EMPLOYEE" ? (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
      <Link href={withParams("/inventory", sp, { view: null, page: null })} className={cn("rounded-md px-3 py-1.5", !compare ? "bg-brand-50 font-medium text-brand-800" : "text-slate-600")}>{t("inventory.list")}</Link>
      <Link href={withParams("/inventory", sp, { view: "compare", page: null })} className={cn("rounded-md px-3 py-1.5", compare ? "bg-brand-50 font-medium text-brand-800" : "text-slate-600")}>{t("inventory.compare")}</Link>
    </div>
  ) : null;

  const actions = (
    <>
      {viewTabs}
      {can(actor, "movements.receive") ? <ButtonLink href="/record?type=STOCK_RECEIPT">{t("inventory.receive")}</ButtonLink> : null}
    </>
  );

  const filterForm = (withSort: boolean) => (
    <form method="get" className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
      {compare ? <input type="hidden" name="view" value="compare" /> : null}
      {sp.state ? <input type="hidden" name="state" value={sp.state} /> : null}
      <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder={t("inventory.searchPlaceholder")} aria-label={t("common.search")} />
      <Select name="categoryId" defaultValue={sp.categoryId ?? ""} aria-label={t("common.category")}>
        <option value="">{t("products.allCategories")}</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{pname(c, f.locale)}</option>)}
      </Select>
      {withSort ? (
        <Select name="sort" defaultValue={sp.sort ?? "state"} aria-label={t("inventory.sort.label")}>
          {SORTS.map((s) => <option key={s} value={s}>{t(`inventory.sort.${s}`)}</option>)}
        </Select>
      ) : <span className="hidden lg:block" />}
      <Button type="submit" variant="secondary">{t("common.filter")}</Button>
    </form>
  );

  if (compare) {
    const data = await compareInventory(actor, { q: sp.q, categoryId: sp.categoryId });
    return (
      <>
        <PageHeader title={t("inventory.title")} description={t("inventory.compareHint")} actions={actions} />
        <Card>
          {filterForm(false)}
          {data.products.length ? <CompareTable data={data} f={f} /> : <EmptyState title={t("inventory.empty")} description={t("inventory.emptyHint")} />}
        </Card>
      </>
    );
  }

  const state = sp.state ? STATES[sp.state] : undefined;
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as InventoryFilters["sort"]) : "state";
  const data = await listInventory(actor, { branchId, q: sp.q, categoryId: sp.categoryId, state, sort, page: Number(sp.page) || 1 });
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const showBranch = !branchId;
  const tabs = [
    { key: "", label: t("inventory.tabs.all") },
    { key: "attention", label: t("inventory.tabs.attention") },
    { key: "LOW", label: t("inventory.tabs.low") },
    { key: "CRITICAL", label: t("inventory.tabs.critical") },
    { key: "OUT_OF_STOCK", label: t("inventory.tabs.out") },
  ];

  return (
    <>
      <PageHeader title={t("inventory.title")} description={t("inventory.subtitle")} actions={actions} />
      <Tabs active={sp.state ?? ""} items={tabs.map((x) => ({ key: x.key, label: x.label, href: withParams("/inventory", sp, { state: x.key || null, page: null }) }))} />
      <Card>
        {filterForm(true)}
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("inventory.col.product")}</th>
                  {showBranch ? <th>{t("inventory.col.branch")}</th> : null}
                  <th className="text-end">{t("inventory.col.available")}</th>
                  <th className="text-end">{t("inventory.col.min")}</th>
                  <th>{t("inventory.col.state")}</th>
                  <th className="text-end">{t("inventory.col.adc")}</th>
                  <th className="text-end">{t("inventory.col.days")}</th>
                  <th className="text-end">{t("inventory.col.value")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="min-w-48">
                      <Link href={`/products/${r.productId}`} className="font-medium text-slate-800 hover:text-brand-700">{f.locale === "ar" ? r.nameAr || r.name : r.name}</Link>
                      <span className="block text-xs text-slate-400"><span dir="ltr" className="font-mono">{r.sku}</span>{r.categoryName ? ` · ${f.locale === "ar" ? r.categoryNameAr || r.categoryName : r.categoryName}` : ""}</span>
                    </td>
                    {showBranch ? <td className="whitespace-nowrap text-xs text-slate-600">{f.locale === "ar" ? r.branchNameAr || r.branchName : r.branchName} <span className="text-slate-400">{r.branchCode}</span></td> : null}
                    <td className="tnum whitespace-nowrap text-end font-semibold">
                      {f.num(r.available)} <span className="text-xs font-normal text-slate-500">{t(`enums.unit.${r.baseUnit}`)}</span>
                      {r.reserved ? <span className="block text-[11px] font-normal text-slate-400">{t("inventory.reserved", { n: f.num(r.reserved) })}</span> : null}
                    </td>
                    <td className="tnum text-end text-slate-600">{r.minStock ? f.num(r.minStock) : "—"}</td>
                    <td><StockBadge state={r.state} t={t} pending={r.pending} /></td>
                    <td className="tnum text-end text-slate-600">{r.avgDailyConsumption ? f.num(r.avgDailyConsumption, 2) : "—"}</td>
                    <td className={cn("tnum text-end", r.daysRemaining !== null && r.daysRemaining < 3 ? "font-semibold text-rose-600" : r.daysRemaining !== null && r.daysRemaining < 7 ? "text-amber-700" : "text-slate-600")}>
                      {r.daysRemaining === null ? "—" : f.num(r.daysRemaining, 1)}
                    </td>
                    <td className="tnum whitespace-nowrap text-end">{f.money(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("inventory.empty")} description={t("inventory.emptyHint")} />
        )}
        <Pagination
          path="/inventory"
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

const CELL: Record<StockState, string> = {
  NORMAL: "bg-emerald-50 text-emerald-800",
  LOW: "bg-amber-50 text-amber-800",
  CRITICAL: "bg-orange-100 text-orange-800",
  OUT_OF_STOCK: "bg-rose-100 text-rose-800",
};

function CompareTable({ data, f }: { data: Awaited<ReturnType<typeof compareInventory>>; f: Fmt }) {
  const { t, locale } = f;
  return (
    <>
      <div className="flex flex-wrap gap-2 px-4 pt-3 text-xs">
        {(Object.keys(CELL) as StockState[]).map((s) => (
          <span key={s} className={cn("rounded px-2 py-0.5", CELL[s])}>{t(`enums.stock.${s}`)}</span>
        ))}
      </div>
      <div className="table-wrap mt-2">
        <table className="tbl">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 bg-slate-50">{t("inventory.col.product")}</th>
              {data.branches.map((b) => <th key={b.id} className="text-center" title={bname(b, locale)}>{b.code}</th>)}
              <th className="text-end">{t("common.total")}</th>
            </tr>
          </thead>
          <tbody>
            {data.products.map((p) => {
              const total = Object.values(p.cells).reduce((s, c) => s + c.quantity, 0);
              return (
                <tr key={p.productId}>
                  <td className="sticky start-0 z-10 min-w-44 bg-white">
                    <Link href={`/products/${p.productId}`} className="font-medium text-slate-800 hover:text-brand-700">{locale === "ar" ? p.nameAr || p.name : p.name}</Link>
                    <span className="block text-xs text-slate-400">{t(`enums.unit.${p.baseUnit}`)}</span>
                  </td>
                  {data.branches.map((b) => {
                    const c = p.cells[b.id];
                    return (
                      <td key={b.id} className="p-1 text-center">
                        {c ? (
                          <span className={cn("tnum block rounded-md px-2 py-1.5 text-sm font-semibold", CELL[c.state])} title={`${t("inventory.col.min")}: ${f.num(c.minStock)}`}>
                            {f.num(c.available)}
                            {c.minStock ? <span className="block text-[10px] font-normal opacity-70">/ {f.num(c.minStock)}</span> : null}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">{t("inventory.notStocked")}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="tnum text-end font-semibold">{f.num(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
