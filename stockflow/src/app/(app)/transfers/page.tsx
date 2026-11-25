import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { getSelectedBranch } from "@/server/branch-selection";
import { listTransfers } from "@/server/transfers";
import { getFmt } from "@/i18n/server";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { Pagination, Tabs } from "@/components/ui/nav";
import { TransferBadge, bname } from "@/components/status";
import { num } from "@/lib/num";

export const metadata = { title: "Transfers" };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor("transfers.view");
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "open";
  const branchId = await getSelectedBranch(actor);
  const data = await listTransfers(actor, { branchId: branchId ?? undefined, status: tab === "open" ? "OPEN" : undefined, page: Number(sp.page) || 1 });
  const f = await getFmt();
  const { t, locale } = f;

  return (
    <>
      <PageHeader
        title={t("transfers.title")}
        description={t("transfers.subtitle")}
        actions={can(actor, "transfers.manage") ? <ButtonLink href="/transfers/new">{t("transfers.new")}</ButtonLink> : null}
      />
      <Tabs active={tab} items={[{ key: "open", label: t("transfers.tabs.open"), href: "/transfers" }, { key: "all", label: t("transfers.tabs.all"), href: "/transfers?tab=all" }]} />
      <Card>
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("transfers.col.ref")}</th>
                  <th>{t("transfers.col.route")}</th>
                  <th>{t("common.status")}</th>
                  <th className="text-end">{t("common.items")}</th>
                  <th className="text-end">{t("transfers.col.qty")}</th>
                  <th>{t("common.createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/transfers/${r.id}`} className="font-medium text-brand-700 hover:underline" dir="ltr">TRF-{r.seq}</Link></td>
                    <td className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {bname(r.source, locale)}
                        <ArrowLeft className="size-3.5 text-slate-400 ltr:rotate-180" aria-label="→" />
                        {bname(r.destination, locale)}
                      </span>
                    </td>
                    <td><TransferBadge status={r.status} t={t} /></td>
                    <td className="tnum text-end">{f.num(r.items.length)}</td>
                    <td className="tnum text-end">{f.num(r.items.reduce((s, i) => s + num(i.requestedQty), 0))}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{f.dateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("transfers.empty")} description={t("transfers.emptyHint")} />
        )}
        <Pagination path="/transfers" params={sp} page={data.page} pageSize={data.pageSize} total={data.total}
          labels={{ prev: t("common.prev"), next: t("common.next"), summary: t("common.results", { n: data.total }) }} />
      </Card>
    </>
  );
}
