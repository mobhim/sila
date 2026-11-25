import Link from "next/link";
import type { ReplenishmentStatus } from "@prisma/client";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { getSelectedBranch } from "@/server/branch-selection";
import { listRequestsByStatuses } from "@/server/procurement-queries";
import { getFmt } from "@/i18n/server";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { Pagination, Tabs, withParams } from "@/components/ui/nav";
import { ReplBadge, bname } from "@/components/status";
import { num } from "@/lib/num";

export const metadata = { title: "Replenishment" };

const TABS: Record<string, ReplenishmentStatus[] | undefined> = {
  open: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"],
  approval: ["DRAFT", "PENDING_APPROVAL"],
  all: undefined,
  received: ["RECEIVED"],
  cancelled: ["CANCELLED"],
};

export default async function ReplenishmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor("replenishment.view");
  const sp = await searchParams;
  const tab = sp.tab && sp.tab in TABS ? sp.tab : "open";
  const branchId = await getSelectedBranch(actor);
  const page = Number(sp.page) || 1;
  const data = await listRequestsByStatuses(actor, { branchId, statuses: TABS[tab], page });
  const f = await getFmt();
  const { t, locale } = f;

  return (
    <>
      <PageHeader
        title={t("replenishment.title")}
        description={t("replenishment.subtitle")}
        actions={can(actor, "replenishment.manage") ? <ButtonLink href="/replenishment/new">{t("replenishment.new")}</ButtonLink> : null}
      />
      <Tabs
        active={tab}
        items={Object.keys(TABS).map((k) => ({ key: k, label: t(`replenishment.tabs.${k}`), href: withParams("/replenishment", {}, { tab: k }) }))}
      />
      <Card>
        {data.rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("replenishment.col.ref")}</th>
                  <th>{t("common.branch")}</th>
                  <th>{t("common.supplier")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("replenishment.col.source")}</th>
                  <th className="text-end">{t("common.items")}</th>
                  <th className="text-end">{t("replenishment.col.value")}</th>
                  <th>{t("common.createdAt")}</th>
                  <th>{t("replenishment.col.expected")}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/replenishment/${r.id}`} className="font-medium text-brand-700 hover:underline" dir="ltr">REQ-{r.seq}</Link></td>
                    <td className="whitespace-nowrap">{bname(r.branch, locale)} <span className="text-xs text-slate-400">{r.branch.code}</span></td>
                    <td>{r.supplier?.name ?? <span className="text-slate-400">{t("replenishment.noSupplier")}</span>}</td>
                    <td><ReplBadge status={r.status} t={t} /></td>
                    <td className="text-xs text-slate-500">{t(`enums.source.${r.source}`)}</td>
                    <td className="tnum text-end">{f.num(r.items.length)}</td>
                    <td className="tnum text-end">{f.money(r.items.reduce((s, i) => s + num(i.requestedQty) * num(i.unitCost), 0))}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{f.dateTime(r.createdAt)}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{f.date(r.expectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("replenishment.empty")} description={t("replenishment.emptyHint")} />
        )}
        <Pagination
          path="/replenishment"
          params={sp}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          labels={{ prev: t("common.prev"), next: t("common.next"), summary: t("common.results", { n: data.total }) }}
        />
      </Card>
    </>
  );
}
