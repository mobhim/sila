import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listSuppliers } from "@/server/suppliers";
import { can } from "@/server/rbac";
import { getT } from "@/i18n/server";
import { Badge, ButtonLink, Card, EmptyState, Input, PageHeader, Checkbox, btnClass } from "@/components/ui";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string; inactive?: string }> }) {
  const actor = await requireActor("suppliers.view");
  const { t } = await getT();
  const sp = await searchParams;
  const rows = await listSuppliers(actor, { q: sp.q?.slice(0, 80), includeInactive: sp.inactive === "1" });
  const canManage = can(actor, "suppliers.manage");
  return (
    <>
      <PageHeader title={t("suppliers.title")} description={t("suppliers.description")}
        actions={canManage ? <ButtonLink href="/suppliers/new">{t("suppliers.new")}</ButtonLink> : null} />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder={t("common.search")} className="max-w-xs" />
        <Checkbox name="inactive" value="1" defaultChecked={sp.inactive === "1"} label={t("suppliers.showInactive")} />
        <button type="submit" className={btnClass("secondary")}>{t("common.search")}</button>
      </form>
      <Card>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("common.code")}</th><th>{t("common.name")}</th><th>{t("suppliers.contactName")}</th><th>{t("common.phone")}</th>
                  <th className="text-end">{t("suppliers.leadTime")}</th><th className="text-end">{t("common.products")}</th><th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs" dir="ltr">{s.code}</td>
                    <td><Link href={`/suppliers/${s.id}`} className="font-medium text-slate-800 hover:text-brand-700">{s.name}</Link></td>
                    <td className="text-slate-600">{s.contactName ?? "—"}</td>
                    <td className="text-slate-600" dir="ltr">{s.phone ?? "—"}</td>
                    <td className="tnum text-end">{s.leadTimeDays}</td>
                    <td className="tnum text-end">{s._count.products}</td>
                    <td><Badge tone={s.status === "ACTIVE" ? "green" : "gray"}>{t(`enums.recordStatus.${s.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("suppliers.empty")} description={t("suppliers.emptyHint")} action={canManage ? <ButtonLink href="/suppliers/new">{t("suppliers.new")}</ButtonLink> : null} />
        )}
      </Card>
    </>
  );
}
