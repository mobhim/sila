import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listUsers } from "@/server/users";
import { branchOptions } from "@/server/branches";
import { can } from "@/server/rbac";
import { getFmt } from "@/i18n/server";
import { Badge, ButtonLink, Card, EmptyState, Input, PageHeader, btnClass } from "@/components/ui";
import { AutoSubmitSelect } from "@/components/ui/forms";
import { bname } from "@/components/status";

export const metadata = { title: "Users" };

const ROLES = ["OWNER", "MANAGER", "EMPLOYEE", "SUPPLIER"] as const;
type R = (typeof ROLES)[number];

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor("users.view");
  const f = await getFmt();
  const { t, locale } = f;
  const sp = await searchParams;
  const role = ROLES.includes(sp.role as R) ? (sp.role as R) : undefined;
  const status = sp.status === "ACTIVE" || sp.status === "INACTIVE" ? sp.status : undefined;
  const branches = await branchOptions(actor);
  const branchId = sp.branch && branches.some((b) => b.id === sp.branch) ? sp.branch : undefined;
  const rows = await listUsers(actor, { q: sp.q?.slice(0, 80), role, status, branchId });
  const canManage = can(actor, "users.manage");

  return (
    <>
      <PageHeader title={t("users.title")} description={actor.role === "OWNER" ? t("users.description") : t("users.managerScope")}
        actions={canManage ? <ButtonLink href="/employees/new">{t("users.new")}</ButtonLink> : null} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]" method="get">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder={`${t("common.search")}: ${t("common.name")} / ${t("common.email")}`} />
        {actor.role === "OWNER" ? (
          <AutoSubmitSelect name="role" defaultValue={role ?? ""} aria-label={t("common.role")}>
            <option value="">{t("users.allRoles")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`enums.role.${r}`)}</option>)}
          </AutoSubmitSelect>
        ) : null}
        <AutoSubmitSelect name="branch" defaultValue={branchId ?? ""} aria-label={t("common.branch")}>
          <option value="">{t("common.allBranches")}</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{bname(b, locale)}</option>)}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="status" defaultValue={status ?? ""} aria-label={t("common.status")}>
          <option value="">{t("users.allStatuses")}</option>
          <option value="ACTIVE">{t("enums.userStatus.ACTIVE")}</option>
          <option value="INACTIVE">{t("enums.userStatus.INACTIVE")}</option>
        </AutoSubmitSelect>
        <button type="submit" className={btnClass("secondary")}>{t("common.search")}</button>
      </form>
      <Card>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("common.name")}</th>
                  <th>{t("common.role")}</th>
                  <th>{t("common.branches")}</th>
                  <th>{t("users.lastLogin")}</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/employees/${u.id}`} className="font-medium text-slate-800 hover:text-brand-700">{u.name}</Link>
                      <div className="text-xs text-slate-500" dir="ltr">{u.email}</div>
                    </td>
                    <td>{t(`enums.role.${u.role}`)}{u.supplier ? <div className="text-xs text-slate-500">{u.supplier.name}</div> : null}</td>
                    <td className="text-slate-600">
                      {u.role === "OWNER" ? t("common.allBranches") : u.branches.length ? u.branches.map((b) => b.branch.code).join("، ") : "—"}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{u.lastLoginAt ? f.dateTime(u.lastLoginAt) : <span className="text-slate-400">{t("users.never")}</span>}</td>
                    <td><Badge tone={u.status === "ACTIVE" ? "green" : "gray"}>{t(`enums.userStatus.${u.status}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("users.empty")} description={t("users.emptyHint")} action={canManage ? <ButtonLink href="/employees/new">{t("users.new")}</ButtonLink> : null} />
        )}
      </Card>
    </>
  );
}
