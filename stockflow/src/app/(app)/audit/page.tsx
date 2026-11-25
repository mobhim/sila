import { requireActor } from "@/server/auth/current";
import { listAuditLogs } from "@/server/admin-queries";
import { branchOptions } from "@/server/branches";
import { getFmt } from "@/i18n/server";
import { Card, EmptyState, Input, PageHeader, btnClass } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/forms";
import { Pagination } from "@/components/ui/nav";
import { bname } from "@/components/status";
import { AuditChanges } from "@/components/admin/audit-changes";

export const metadata = { title: "Audit log" };

function day(s: string | undefined, end = false) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00+03:00`);
  return end ? new Date(d.getTime() + 86400000) : d;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor("audit.view");
  const f = await getFmt();
  const { t, locale } = f;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, branches] = await Promise.all([
    listAuditLogs(actor, {
      action: sp.action?.slice(0, 80) || undefined,
      entityType: sp.entity || undefined,
      userId: sp.user || undefined,
      branchId: sp.branch || undefined,
      from: day(sp.from),
      to: day(sp.to, true),
      page,
    }),
    branchOptions(actor),
  ]);
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  return (
    <>
      <PageHeader title={t("audit.title")} description={t("audit.description")} />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto_auto_auto]">
        <Input name="action" defaultValue={sp.action ?? ""} placeholder={t("audit.actionPlaceholder")} dir="ltr" aria-label={t("audit.action")} />
        <AutoSubmitSelect name="entity" defaultValue={sp.entity ?? ""} aria-label={t("audit.entity")}>
          <option value="">{t("audit.allEntities")}</option>
          {data.entityTypes.map((e) => <option key={e} value={e}>{e}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="user" defaultValue={sp.user ?? ""} aria-label={t("common.user")}>
          <option value="">{t("audit.allUsers")}</option>
          {data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="branch" defaultValue={sp.branch ?? ""} aria-label={t("common.branch")}>
          <option value="">{t("common.allBranches")}</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{bname(b, locale)}</option>)}
        </AutoSubmitSelect>
        <Input type="date" name="from" defaultValue={sp.from ?? ""} aria-label={t("common.from")} />
        <Input type="date" name="to" defaultValue={sp.to ?? ""} aria-label={t("common.to")} />
        <button type="submit" className={btnClass("secondary")}>{t("common.filter")}</button>
      </form>
      <Card>
        {data.rows.length ? (
          <>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>{t("common.date")}</th><th>{t("common.user")}</th><th>{t("audit.action")}</th><th>{t("audit.entity")}</th><th>{t("common.branch")}</th><th>{t("audit.changes")}</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => {
                    const b = r.branchId ? branchMap.get(r.branchId) : null;
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="whitespace-nowrap text-slate-600">{f.dateTime(r.createdAt)}</td>
                        <td>{r.user?.name ?? <span className="text-slate-400">{t("audit.system")}</span>}{r.ip ? <div className="text-xs text-slate-400" dir="ltr">{r.ip}</div> : null}</td>
                        <td className="font-mono text-xs" dir="ltr">{r.action}</td>
                        <td className="text-xs text-slate-600"><span className="font-mono" dir="ltr">{r.entityType}</span>{r.summary ? <div className="max-w-[14rem] truncate text-slate-500" title={r.summary}>{r.summary}</div> : null}</td>
                        <td className="text-slate-600">{b ? b.code : "—"}</td>
                        <td className="min-w-[12rem]"><AuditChanges before={r.before} after={r.after} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination path="/audit" params={sp} page={data.page} pageSize={data.pageSize} total={data.total}
              labels={{ prev: t("common.prev"), next: t("common.next"), summary: t("common.page", { page: data.page, pages: Math.max(1, Math.ceil(data.total / data.pageSize)) }) }} />
          </>
        ) : <EmptyState title={t("audit.empty")} />}
      </Card>
    </>
  );
}
