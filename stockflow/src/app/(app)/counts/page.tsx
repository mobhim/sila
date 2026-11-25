import Link from "next/link";
import type { CountStatus } from "@prisma/client";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { listCounts } from "@/server/counts";
import { getSelectedBranch } from "@/server/branch-selection";
import { getFmt } from "@/i18n/server";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { Pagination, Tabs, withParams } from "@/components/ui/nav";
import { CountBadge, bname } from "@/components/status";

export const metadata = { title: "Stock counts" };

const TABS = ["all", "IN_PROGRESS", "SUBMITTED", "APPROVED"] as const;

export default async function CountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor("counts.enter");
  const sp = await searchParams;
  const f = await getFmt();
  const { t, locale } = f;
  const tab = (TABS as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof TABS)[number]) : "all";
  const branchId = await getSelectedBranch(actor);
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await listCounts(actor, { branchId: branchId ?? undefined, status: tab === "all" ? undefined : (tab as CountStatus), page });

  return (
    <>
      <PageHeader title={t("counts.title")} description={t("counts.description")} actions={can(actor, "counts.manage") ? <ButtonLink href="/counts/new">{t("counts.new")}</ButtonLink> : null} />
      <Tabs active={tab} items={TABS.map((k) => ({ key: k, label: t(`counts.tabs.${k}`), href: withParams("/counts", sp, { status: k === "all" ? null : k, page: null }) }))} />
      <Card>
        {data.rows.length ? (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/counts/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{t("counts.no", { no: c.seq })} · {c.branch.code}</p>
                      <p className="truncate text-xs text-slate-500">{c.category ? bname(c.category, locale) : t("counts.allProducts")} · {f.date(c.createdAt)} · {f.num(c._count.items)} {t("counts.lines")}</p>
                    </div>
                    <CountBadge status={c.status} t={t} />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="table-wrap hidden md:block">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("common.branch")}</th>
                    <th>{t("counts.scope")}</th>
                    <th className="text-end">{t("counts.lines")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.createdAt")}</th>
                    <th>{t("common.updatedAt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/counts/${c.id}`} className="font-medium text-brand-700 hover:underline">CNT-{c.seq}</Link></td>
                      <td>{bname(c.branch, locale)} <span className="text-xs text-slate-400">{c.branch.code}</span></td>
                      <td>{c.category ? bname(c.category, locale) : t("counts.allProducts")}</td>
                      <td className="tnum text-end">{f.num(c._count.items)}</td>
                      <td><CountBadge status={c.status} t={t} /></td>
                      <td className="whitespace-nowrap">{f.dateTime(c.createdAt)}</td>
                      <td className="whitespace-nowrap">{f.dateTime(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination path="/counts" params={sp} page={data.page} pageSize={data.pageSize} total={data.total}
              labels={{ prev: t("common.prev"), next: t("common.next"), summary: t("common.results", { n: data.total }) }} />
          </>
        ) : (
          <EmptyState title={t("counts.empty")} description={t("counts.emptyHint")} action={can(actor, "counts.manage") ? <ButtonLink href="/counts/new">{t("counts.new")}</ButtonLink> : null} />
        )}
      </Card>
    </>
  );
}
