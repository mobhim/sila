import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listBranches } from "@/server/branches";
import { can } from "@/server/rbac";
import { getFmt } from "@/i18n/server";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { bname } from "@/components/status";

export const metadata = { title: "Branches" };

const STATUS_TONE = { ACTIVE: "green", INACTIVE: "amber", CLOSED: "gray" } as const;

export default async function BranchesPage() {
  const actor = await requireActor("branches.view");
  const { t, locale } = await getFmt();
  const rows = await listBranches(actor, { includeInactive: true });
  const canManage = can(actor, "branches.manage");

  return (
    <>
      <PageHeader title={t("branches.title")} description={t("branches.description")}
        actions={canManage ? <ButtonLink href="/branches/new">{t("branches.new")}</ButtonLink> : null} />
      <Card>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("common.code")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("common.city")}</th>
                  <th>{t("branches.manager")}</th>
                  <th className="text-end">{t("branches.users")}</th>
                  <th className="text-end">{t("branches.stockedItems")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs" dir="ltr">{b.code}</td>
                    <td><Link href={`/branches/${b.id}`} className="font-medium text-slate-800 hover:text-brand-700">{bname(b, locale)}</Link></td>
                    <td className="text-slate-600">{b.city ?? "—"}</td>
                    <td className="text-slate-600">{b.manager?.name ?? <span className="text-slate-400">{t("branches.noManager")}</span>}</td>
                    <td className="tnum text-end">{b._count.users}</td>
                    <td className="tnum text-end">{b._count.inventory}</td>
                    <td><Badge tone={STATUS_TONE[b.status]}>{t(`enums.branchStatus.${b.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("branches.empty")} description={t("branches.emptyHint")}
            action={canManage ? <ButtonLink href="/branches/new">{t("branches.new")}</ButtonLink> : null} />
        )}
      </Card>
    </>
  );
}
