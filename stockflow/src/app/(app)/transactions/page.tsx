import type { TxType } from "@prisma/client";
import { requireActor } from "@/server/auth/current";
import { getSelectedBranch } from "@/server/branch-selection";
import { branchOptions } from "@/server/branches";
import { ledgerUsers, listTransactions } from "@/server/ledger-queries";
import { db } from "@/server/db";
import { hasBranchAccess } from "@/server/rbac";
import { getFmt } from "@/i18n/server";
import { Button, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { Pagination } from "@/components/ui/nav";
import { TxTable } from "@/components/inventory/tx-table";
import { ProductFilter } from "@/components/inventory/product-filter";
import { bname, pname } from "@/components/status";
import { TIME_ZONE } from "@/i18n/format";

export const metadata = { title: "Transactions" };

const TYPES: TxType[] = ["INITIAL_STOCK", "CONSUMPTION", "WITHDRAWAL", "STOCK_RECEIPT", "PURCHASE_RECEIPT", "RETURN", "DAMAGED", "EXPIRED", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT", "COUNT_CORRECTION"];

/** yyyy-mm-dd interpreted as a day in the business time zone (Asia/Riyadh = UTC+3). */
function dayStart(s: string | undefined, plusDays = 0): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const offset = TIME_ZONE === "Asia/Riyadh" ? "+03:00" : "Z";
  const d = new Date(`${s}T00:00:00${offset}`);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + plusDays * 86400000);
}

type SP = Record<string, string | undefined>;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor("transactions.view");
  const sp = await searchParams;
  const f = await getFmt();
  const { t, locale } = f;
  const selected = await getSelectedBranch(actor);
  const branchParam = sp.branchId === "all" ? null : sp.branchId && hasBranchAccess(actor, sp.branchId) ? sp.branchId : selected;
  const type = TYPES.includes(sp.type as TxType) ? (sp.type as TxType) : null;

  const [data, branches, users, product] = await Promise.all([
    listTransactions(actor, {
      branchId: branchParam,
      productId: sp.productId || null,
      type,
      userId: sp.userId || null,
      from: dayStart(sp.from),
      to: dayStart(sp.to, 1),
      page: Number(sp.page) || 1,
    }),
    branchOptions(actor),
    ledgerUsers(actor),
    sp.productId ? db.product.findUnique({ where: { id: sp.productId }, select: { name: true, nameAr: true, sku: true } }) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader title={t("transactions.title")} description={t("transactions.subtitle")} />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-3 lg:grid-cols-[1.5fr_3fr]">
          <Field label={t("transactions.product")}>
            <ProductFilter branchId={branchParam ?? branches[0]?.id ?? null} selectedLabel={product ? `${pname(product, locale)} · ${product.sku}` : null} />
          </Field>
          <form method="get" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
            {sp.productId ? <input type="hidden" name="productId" value={sp.productId} /> : null}
            <Field label={t("common.branch")}>
              <Select name="branchId" defaultValue={branchParam ?? "all"}>
                {actor.role === "OWNER" || branches.length > 1 ? <option value="all">{t("common.allBranches")}</option> : null}
                {branches.map((b) => <option key={b.id} value={b.id}>{bname(b, locale)}</option>)}
              </Select>
            </Field>
            <Field label={t("common.type")}>
              <Select name="type" defaultValue={type ?? ""}>
                <option value="">{t("transactions.allTypes")}</option>
                {TYPES.map((x) => <option key={x} value={x}>{t(`enums.tx.${x}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("common.user")}>
              <Select name="userId" defaultValue={sp.userId ?? ""}>
                <option value="">{t("transactions.allUsers")}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field label={t("common.from")}><Input type="date" name="from" defaultValue={sp.from ?? ""} dir="ltr" /></Field>
            <Field label={t("common.to")}><Input type="date" name="to" defaultValue={sp.to ?? ""} dir="ltr" /></Field>
            <Button type="submit" variant="secondary">{t("transactions.apply")}</Button>
          </form>
        </div>
        {data.rows.length ? <TxTable rows={data.rows} f={f} showBranch={!branchParam} /> : <EmptyState title={t("transactions.empty")} description={t("transactions.emptyHint")} />}
        <Pagination
          path="/transactions"
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
