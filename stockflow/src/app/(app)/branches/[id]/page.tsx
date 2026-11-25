import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { getBranch } from "@/server/branches";
import { listInventory } from "@/server/inventory/queries";
import { branchRecentTransactions, managerOptions } from "@/server/admin-queries";
import { can } from "@/server/rbac";
import { AppError } from "@/server/errors";
import { getFmt } from "@/i18n/server";
import { Badge, ButtonLink, Card, CardBody, CardHeader, DescList, PageHeader, Stat } from "@/components/ui";
import { TxBadge, bname, pname } from "@/components/status";
import { BranchEdit } from "./edit";

export const metadata = { title: "Branch" };

export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("branches.view");
  const { id } = await params;
  const f = await getFmt();
  const { t, locale } = f;
  let branch;
  try {
    branch = await getBranch(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const canManage = can(actor, "branches.manage");
  const canTx = can(actor, "transactions.view");
  const [all, attention, recent, managers] = await Promise.all([
    listInventory(actor, { branchId: id, pageSize: 500 }),
    listInventory(actor, { branchId: id, state: "ATTENTION", pageSize: 1 }),
    canTx ? branchRecentTransactions(actor, id) : Promise.resolve([]),
    canManage ? managerOptions(actor) : Promise.resolve([]),
  ]);
  const value = all.rows.reduce((s, r) => s + r.value, 0);
  const tone = { ACTIVE: "green", INACTIVE: "amber", CLOSED: "gray" } as const;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{bname(branch, locale)} <Badge tone={tone[branch.status]}>{t(`enums.branchStatus.${branch.status}`)}</Badge></span>}
        description={<span dir="ltr">{branch.code}</span>}
        back={{ href: "/branches", label: t("branches.title") }}
        actions={<ButtonLink href={`/inventory?branch=${id}`} variant="secondary">{t("branches.viewInventory")}</ButtonLink>}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("branches.value")} value={f.money(value)} />
        <Stat label={t("branches.stockedItems")} value={f.num(all.total)} />
        <Stat label={t("branches.attention")} value={f.num(attention.total)} tone={attention.total ? "warn" : "good"} href={`/inventory?branch=${id}&state=ATTENTION`} />
        <Stat label={t("branches.users")} value={f.num(branch.users.length)} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("branches.info")} />
          <CardBody>
            <DescList items={[
              { label: t("common.name"), value: branch.name },
              { label: t("common.nameAr"), value: branch.nameAr ?? "—" },
              { label: t("common.city"), value: branch.city ?? "—" },
              { label: t("common.address"), value: branch.address ?? "—" },
              { label: t("common.phone"), value: branch.phone ? <span dir="ltr">{branch.phone}</span> : "—" },
              { label: t("common.email"), value: branch.email ?? "—" },
              { label: t("branches.manager"), value: branch.manager?.name ?? t("branches.noManager") },
              { label: t("branches.replenishment"), value: `${t("branches.reviewPeriod")}: ${branch.reviewPeriodDays} · ${branch.autoDraftReplenishment ? t("branches.autoDraftOn") : t("branches.autoDraftOff")}` },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("branches.assigned")} />
          {branch.users.length ? (
            <ul className="divide-y divide-slate-100">
              {branch.users.map((u) => (
                <li key={u.userId} className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {can(actor, "users.view") ? <Link href={`/employees/${u.user.id}`} className="hover:text-brand-700">{u.user.name}</Link> : u.user.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">{t(`enums.role.${u.user.role}`)}{u.isPrimary ? ` · ${t("branches.primary")}` : ""}</p>
                  </div>
                  {u.user.status !== "ACTIVE" ? <Badge tone="gray">{t(`enums.userStatus.${u.user.status}`)}</Badge> : null}
                </li>
              ))}
            </ul>
          ) : <CardBody><p className="text-sm text-slate-500">{t("branches.noUsers")}</p></CardBody>}
        </Card>
      </div>

      {canTx ? (
        <Card className="mt-4">
          <CardHeader title={t("branches.recentTx")} actions={<Link href={`/transactions?branch=${id}`} className="text-xs font-medium text-brand-700 hover:underline">{t("branches.allTx")}</Link>} />
          {recent.length ? (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>{t("common.date")}</th><th>{t("common.product")}</th><th>{t("common.type")}</th><th className="text-end">{t("common.quantity")}</th><th>{t("common.user")}</th></tr></thead>
                <tbody>
                  {recent.map((x) => (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap text-slate-600">{f.dateTime(x.createdAt)}</td>
                      <td>{pname(x.product, locale)}</td>
                      <td><TxBadge type={x.type} t={t} /></td>
                      <td className={`tnum text-end font-medium ${Number(x.quantity) < 0 ? "text-rose-700" : "text-emerald-700"}`} dir="ltr">{Number(x.quantity) > 0 ? "+" : ""}{f.num(Number(x.quantity))} <span className="text-xs font-normal text-slate-400">{t(`enums.unit.${x.product.baseUnit}`)}</span></td>
                      <td className="text-slate-600">{x.user.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <CardBody><p className="text-sm text-slate-500">{t("branches.noTx")}</p></CardBody>}
        </Card>
      ) : null}

      {canManage ? (
        <Card className="mt-4">
          <CardHeader title={t("branches.edit")} />
          <CardBody>
            <BranchEdit managers={managers} defaults={{
              id: branch.id, code: branch.code, name: branch.name, nameAr: branch.nameAr, address: branch.address, city: branch.city, phone: branch.phone,
              email: branch.email, managerId: branch.managerId, status: branch.status, autoDraftReplenishment: branch.autoDraftReplenishment, reviewPeriodDays: branch.reviewPeriodDays,
            }} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
