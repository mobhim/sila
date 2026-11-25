import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { getSupplier, supplierPerformance } from "@/server/suppliers";
import { supplierOpenRequests } from "@/server/admin-queries";
import { can } from "@/server/rbac";
import { AppError } from "@/server/errors";
import { getFmt } from "@/i18n/server";
import { Badge, ButtonLink, Card, CardBody, CardHeader, DescList, PageHeader, Stat } from "@/components/ui";
import { ReplBadge, bname, pname } from "@/components/status";
import { SupplierEditor } from "../form";

export const metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("suppliers.view");
  const { id } = await params;
  const f = await getFmt();
  const { t, locale } = f;
  let s;
  try {
    s = await getSupplier(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const canManage = can(actor, "suppliers.manage");
  const [open, perf] = await Promise.all([
    can(actor, "replenishment.view") ? supplierOpenRequests(actor, id) : Promise.resolve([]),
    can(actor, "reports.view") ? supplierPerformance(actor, new Date(Date.now() - 90 * 86400000), new Date(), id) : Promise.resolve([]),
  ]);
  const p = perf[0];

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{s.name}<Badge tone={s.status === "ACTIVE" ? "green" : "gray"}>{t(`enums.recordStatus.${s.status}`)}</Badge></span>}
        description={<span dir="ltr">{s.code}</span>}
        back={{ href: "/suppliers", label: t("suppliers.title") }}
      />

      {can(actor, "reports.view") ? (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t("suppliers.performance")}</h2>
          {p ? (
            <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t("suppliers.requests")} value={f.num(p.requests)} sub={`${t("enums.replenishment.RECEIVED")}: ${f.num(p.completed)}`} />
              <Stat label={t("suppliers.fillRate")} value={f.pct(p.fillRate)} />
              <Stat label={t("suppliers.onTime")} value={f.pct(p.onTimeRate)} />
              <Stat label={t("suppliers.avgLead")} value={p.avgLeadDays === null ? "—" : t("common.days", { n: f.num(p.avgLeadDays, 1) })} sub={`${t("suppliers.leadTime")}: ${p.promisedLeadDays}`} />
            </section>
          ) : <p className="mb-4 text-sm text-slate-500">{t("suppliers.noPerformance")}</p>}
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("common.details")} />
          <CardBody>
            <DescList items={[
              { label: t("suppliers.contactName"), value: s.contactName ?? "—" },
              { label: t("common.email"), value: s.email ? <a href={`mailto:${s.email}`} className="text-brand-700 hover:underline" dir="ltr">{s.email}</a> : "—" },
              { label: t("common.phone"), value: s.phone ? <span dir="ltr">{s.phone}</span> : "—" },
              { label: t("suppliers.whatsapp"), value: s.whatsapp ? <span dir="ltr">{s.whatsapp}</span> : "—" },
              { label: t("suppliers.vat"), value: s.vatNumber ?? "—" },
              { label: t("suppliers.leadTime"), value: t("common.days", { n: s.leadTimeDays }) },
              { label: t("common.address"), value: s.address ?? "—" },
              { label: t("common.notes"), value: s.notes ? <span className="whitespace-pre-line">{s.notes}</span> : "—" },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("suppliers.portalUsers")} actions={can(actor, "users.manage") && actor.role === "OWNER" ? <ButtonLink href="/employees/new" size="sm" variant="secondary">{t("suppliers.addPortalUser")}</ButtonLink> : null} />
          {s.users.length ? (
            <ul className="divide-y divide-slate-100">
              {s.users.map((u) => (
                <li key={u.id} className="px-4 py-2.5 sm:px-5">
                  <p className="text-sm font-medium text-slate-800">{actor.role === "OWNER" ? <Link href={`/employees/${u.id}`} className="hover:text-brand-700">{u.name}</Link> : u.name}</p>
                  <p className="text-xs text-slate-500" dir="ltr">{u.email}</p>
                </li>
              ))}
            </ul>
          ) : <CardBody><p className="text-sm text-slate-500">{t("suppliers.noPortalUsers")}</p></CardBody>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {can(actor, "replenishment.view") ? (
          <Card>
            <CardHeader title={t("suppliers.openRequests")} />
            {open.length ? (
              <ul className="divide-y divide-slate-100">
                {open.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                    <div className="min-w-0">
                      <Link href={`/replenishment/${r.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-700">REQ-{r.seq}</Link>
                      <p className="text-xs text-slate-500">{bname(r.branch, locale)} · {f.money(r.items.reduce((a, i) => a + Number(i.requestedQty) * Number(i.unitCost), 0))}</p>
                    </div>
                    <ReplBadge status={r.status} t={t} />
                  </li>
                ))}
              </ul>
            ) : <CardBody><p className="text-sm text-slate-500">{t("suppliers.noOpen")}</p></CardBody>}
          </Card>
        ) : null}
        <Card>
          <CardHeader title={t("suppliers.products")} />
          {s.products.length ? (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {s.products.map((pr) => (
                <li key={pr.id} className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5 text-sm">
                  <Link href={`/products/${pr.id}`} className="truncate text-slate-800 hover:text-brand-700">{pname(pr, locale)}</Link>
                  <span className="font-mono text-xs text-slate-400" dir="ltr">{pr.sku}</span>
                </li>
              ))}
            </ul>
          ) : <CardBody><p className="text-sm text-slate-500">{t("suppliers.noProducts")}</p></CardBody>}
        </Card>
      </div>

      {canManage ? (
        <Card className="mt-4">
          <CardHeader title={t("suppliers.edit")} />
          <CardBody>
            <SupplierEditor defaults={{
              id: s.id, code: s.code, name: s.name, contactName: s.contactName, phone: s.phone, whatsapp: s.whatsapp, email: s.email,
              address: s.address, vatNumber: s.vatNumber, leadTimeDays: s.leadTimeDays, status: s.status, notes: s.notes,
            }} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
