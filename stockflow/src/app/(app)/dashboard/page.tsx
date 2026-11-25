import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { getDashboard } from "@/server/dashboard";
import { getSelectedBranch } from "@/server/branch-selection";
import { getFmt } from "@/i18n/server";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, ButtonLink } from "@/components/ui";
import { BarList, BarsChart, TrendChart } from "@/components/charts";
import { StockBadge, bname } from "@/components/status";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireActor("dashboard.view");
  const branchId = await getSelectedBranch(actor);
  const d = await getDashboard(actor, branchId);
  const f = await getFmt();
  const { t, locale } = f;
  const k = d.kpi;
  const today = new Date();

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={
          <>
            {f.date(today)}
            {f.showHijri ? <span className="ms-2 text-slate-400">· {f.hijri(today)}</span> : null}
          </>
        }
        actions={
          <>
            <ButtonLink href="/record" variant="secondary">{t("nav.record")}</ButtonLink>
            <ButtonLink href="/replenishment">{t("dashboard.reviewRequests")}</ButtonLink>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("dashboard.kpi.value")} value={f.money(k.totalValue)} sub={t("dashboard.kpi.qtySub", { qty: f.num(k.totalQty, 0) })} href="/reports?type=valuation" />
        <Stat label={t("dashboard.kpi.branches")} value={f.num(k.branches)} sub={t("dashboard.kpi.productsSub", { n: f.num(k.activeProducts), stocked: f.num(k.productsStocked) })} href="/branches" />
        <Stat label={t("dashboard.kpi.low")} value={f.num(k.low)} tone={k.low ? "warn" : "default"} href="/inventory?state=LOW" />
        <Stat label={t("dashboard.kpi.critical")} value={f.num(k.critical)} tone={k.critical ? "danger" : "default"} href="/inventory?state=CRITICAL" />
        <Stat label={t("dashboard.kpi.out")} value={f.num(k.out)} tone={k.out ? "danger" : "good"} href="/inventory?state=OUT_OF_STOCK" />
        <Stat label={t("dashboard.kpi.pending")} value={f.num(k.pendingRequests)} sub={k.awaitingApproval ? t("dashboard.kpi.awaiting", { n: k.awaitingApproval }) : undefined} tone={k.awaitingApproval ? "warn" : "default"} href="/replenishment" />
        <Stat label={t("dashboard.kpi.today")} value={f.money(k.consumptionTodayValue)} sub={t("dashboard.kpi.units", { n: f.num(k.consumptionTodayQty, 1) })} href="/transactions?type=CONSUMPTION" />
        <Stat label={t("dashboard.kpi.month")} value={f.money(k.consumptionMonthValue)} sub={t("dashboard.kpi.units", { n: f.num(k.consumptionMonthQty, 0) })} href="/reports?type=consumption" />
        <Stat label={t("dashboard.kpi.adjustments")} value={f.num(k.pendingAdjustments)} tone={k.pendingAdjustments ? "warn" : "default"} href="/adjustments" />
        <Stat label={t("dashboard.kpi.alerts")} value={f.num(d.alertsTotal)} tone={d.alertsTotal ? "danger" : "good"} href="/alerts" />
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("dashboard.trend")} description={t("dashboard.trendHint")} />
          <CardBody>
            <TrendChart data={d.trend} series={[{ key: "inflow", label: t("dashboard.inflow") }, { key: "outflow", label: t("dashboard.outflow") }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.alerts")} actions={<Link href="/alerts" className="text-xs font-medium text-brand-700 hover:underline">{t("dashboard.viewAll")}</Link>} />
          {d.alerts.length ? (
            <ul className="divide-y divide-slate-100">
              {d.alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{bname(a.product, locale)}</p>
                    <p className="text-xs text-slate-500">{a.branch.code} · {t("dashboard.availableOf", { qty: f.num(Number(a.currentQuantity)), min: f.num(Number(a.minStockAtTrigger)) })}</p>
                  </div>
                  <StockBadge state={a.level} t={t} pending={a.status === "REPLENISHMENT_PENDING"} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("dashboard.noAlerts")} description={t("dashboard.noAlertsHint")} />
          )}
        </Card>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("dashboard.topConsumed")} description={t("dashboard.last30")} />
          <CardBody>
            {d.topConsumed.length ? <BarList items={d.topConsumed.map((x) => ({ label: x.product, value: x.qty, sub: t(`enums.unit.${x.unit}`) }))} /> : <p className="text-sm text-slate-500">{t("common.noResults")}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.lowestDays")} description={t("dashboard.lowestDaysHint")} />
          <ul className="divide-y divide-slate-100">
            {d.lowestDays.map((x, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="min-w-0 truncate text-slate-700">{x.product} <span className="text-xs text-slate-400">· {x.branch}</span></span>
                <span className={`tnum shrink-0 font-semibold ${x.days < 3 ? "text-rose-600" : x.days < 7 ? "text-amber-600" : "text-slate-800"}`}>{t("common.days", { n: f.num(Math.max(0, x.days), 1) })}</span>
              </li>
            ))}
            {!d.lowestDays.length ? <li className="px-5 py-4 text-sm text-slate-500">{t("common.noResults")}</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.byCategory")} />
          <CardBody>
            <BarList format="money" items={d.byCategory.map((c) => ({ label: c.category ?? t("dashboard.uncategorised"), value: c.value ?? 0 }))} />
          </CardBody>
        </Card>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("dashboard.comparison")} description={t("dashboard.last30")} actions={<Link href="/inventory?view=compare" className="text-xs font-medium text-brand-700 hover:underline">{t("common.compareBranches")}</Link>} />
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("common.branch")}</th>
                  <th className="text-end">{t("dashboard.col.value")}</th>
                  <th className="text-end">{t("dashboard.col.availability")}</th>
                  <th className="text-end">{t("dashboard.col.low")}</th>
                  <th className="text-end">{t("dashboard.col.consumption")}</th>
                  <th className="text-end">{t("dashboard.col.requests")}</th>
                </tr>
              </thead>
              <tbody>
                {d.comparison.map((r) => (
                  <tr key={String(r.branch_id)}>
                    <td><Link href={`/branches/${r.branch_id}`} className="font-medium text-slate-800 hover:text-brand-700">{String(r.branch_name)}</Link> <span className="text-xs text-slate-400">{String(r.branch)}</span></td>
                    <td className="tnum text-end">{f.money(Number(r.value))}</td>
                    <td className="tnum text-end">{f.pct(r.availability === null ? null : Number(r.availability))}</td>
                    <td className="tnum text-end">{f.num(Number(r.low) + Number(r.critical) + Number(r.out))}</td>
                    <td className="tnum text-end">{f.money(Number(r.consumption_value))}</td>
                    <td className="tnum text-end">{f.num(Number(r.requests))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.comparison.length > 1 ? (
            <CardBody className="border-t border-slate-100">
              <BarsChart data={d.comparison.map((r) => ({ branch: r.branch, value: Number(r.value), consumption: Number(r.consumption_value) }))} x="branch" money
                series={[{ key: "value", label: t("dashboard.col.value") }, { key: "consumption", label: t("dashboard.col.consumption") }]} height={220} />
            </CardBody>
          ) : null}
        </Card>
        <Card>
          <CardHeader title={t("dashboard.fastest")} description={t("dashboard.fastestHint")} />
          <CardBody>
            <BarList items={d.fastest.map((x) => ({ label: `${x.product} · ${x.branch}`, value: x.adc, sub: `${t(`enums.unit.${x.unit}`)}${t("common.perDay")}` }))} />
          </CardBody>
        </Card>
      </section>
    </>
  );
}
