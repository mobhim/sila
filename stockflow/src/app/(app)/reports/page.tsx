import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { runReport, REPORT_TYPES } from "@/server/reports";
import { employeeOptions, parseReportParams, productOptions, REPORT_FILTERS, REPORT_TX_TYPES } from "@/server/report-filters";
import { getSelectedBranch } from "@/server/branch-selection";
import { branchOptions } from "@/server/branches";
import { listCategories } from "@/server/products";
import { getFmt } from "@/i18n/server";
import { Alert, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, btnClass } from "@/components/ui";
import { BarsChart } from "@/components/charts";
import { ReportTable } from "@/components/reports/table";
import { bname } from "@/components/status";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor("reports.view");
  const sp = await searchParams;
  const selected = await getSelectedBranch(actor);
  const parsed = parseReportParams(sp, selected);
  const { type, filters } = parsed;
  const show = REPORT_FILTERS[type];
  const f = await getFmt();
  const { t, locale } = f;

  const [report, branches, categories, employees, products] = await Promise.all([
    runReport(actor, type, filters),
    branchOptions(actor),
    listCategories(),
    show.user ? employeeOptions(actor) : Promise.resolve([]),
    show.product ? productOptions(actor) : Promise.resolve([]),
  ]);

  const tabHref = (k: string) => {
    const q = new URLSearchParams(parsed.query);
    q.set("type", k);
    return `/reports?${q}`;
  };
  const chartRows = report.chart
    ? report.rows.slice(0, 15).map((r) => {
        const o: Record<string, string | number> = { [report.chart!.x]: String(r[report.chart!.x] ?? "").slice(0, 18) };
        for (const s of report.chart!.series) o[s] = Number(r[s] ?? 0);
        return o;
      })
    : [];
  const moneyChart = report.chart ? report.columns.find((c) => c.key === report.chart!.series[0])?.type === "money" : false;

  return (
    <>
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description")}
        actions={
          <>
            <a href={`/api/reports/${type}?${parsed.query}`} className={btnClass("secondary")}><Download className="size-4" />{t("common.exportCsv")}</a>
            <Link href={`/reports/print?${parsed.query}`} target="_blank" className={btnClass("secondary")}><Printer className="size-4" />{t("common.exportPdf")}</Link>
          </>
        }
      />

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label={t("reports.title")}>
        {REPORT_TYPES.map((k) => (
          <Link key={k} href={tabHref(k)} aria-current={k === type ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${k === type ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t(`reports.types.${k}`)}
          </Link>
        ))}
      </nav>

      <Card className="mb-4">
        <CardBody>
          <form method="get" className="grid grid-cols-2 items-end gap-3 md:grid-cols-4 xl:grid-cols-7">
            <input type="hidden" name="type" value={type} />
            {show.dates ? (
              <>
                <Field label={t("common.from")} htmlFor="from"><Input id="from" type="date" name="from" defaultValue={parsed.fromDay} /></Field>
                <Field label={t("common.to")} htmlFor="to"><Input id="to" type="date" name="to" defaultValue={parsed.toDay} /></Field>
              </>
            ) : null}
            {show.branch && (branches.length > 1 || actor.role === "OWNER") ? (
              <Field label={t("common.branch")} htmlFor="branch">
                <Select id="branch" name="branch" defaultValue={filters.branchId ?? "all"}>
                  <option value="all">{t("common.allBranches")}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{bname(b, locale)} · {b.code}</option>)}
                </Select>
              </Field>
            ) : null}
            {show.product ? (
              <Field label={t("common.product")} htmlFor="productId">
                <Select id="productId" name="productId" defaultValue={filters.productId ?? ""}>
                  <option value="">{t("reports.anyProduct")}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{bname(p, locale)} ({p.sku})</option>)}
                </Select>
              </Field>
            ) : null}
            {show.category ? (
              <Field label={t("common.category")} htmlFor="categoryId">
                <Select id="categoryId" name="categoryId" defaultValue={filters.categoryId ?? ""}>
                  <option value="">{t("reports.anyCategory")}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{bname(c, locale)}</option>)}
                </Select>
              </Field>
            ) : null}
            {show.user ? (
              <Field label={t("reports.employee")} htmlFor="userId">
                <Select id="userId" name="userId" defaultValue={filters.userId ?? ""}>
                  <option value="">{t("reports.anyEmployee")}</option>
                  {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            ) : null}
            {show.txType ? (
              <Field label={t("reports.txType")} htmlFor="txType">
                <Select id="txType" name="txType" defaultValue={filters.type ?? ""}>
                  <option value="">{t("reports.anyType")}</option>
                  {REPORT_TX_TYPES.map((x) => <option key={x} value={x}>{t(`enums.tx.${x}`)}</option>)}
                </Select>
              </Field>
            ) : null}
            <div className="flex gap-2">
              <button type="submit" className={btnClass("primary")}>{t("reports.apply")}</button>
              <Link href={`/reports?type=${type}`} className={btnClass("ghost")}>{t("common.reset")}</Link>
            </div>
          </form>
          {!show.dates ? <p className="mt-3 text-xs text-slate-500">{t("reports.currentSnapshot")}</p> : null}
        </CardBody>
      </Card>

      {report.truncated ? <Alert tone="warn" className="mb-4">{t("reports.truncated")}</Alert> : null}

      {report.chart && chartRows.length > 1 ? (
        <Card className="mb-4">
          <CardHeader title={t(`reports.types.${type}`)} description={t(`reports.desc.${type}`)} />
          <CardBody>
            <BarsChart data={chartRows} x={report.chart.x} money={moneyChart} series={report.chart.series.map((s) => ({ key: s, label: t(`reports.col.${s}`) }))} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={t(`reports.types.${type}`)}
          description={report.chart && chartRows.length > 1 ? t("reports.rows", { n: f.num(report.rows.length) }) : `${t(`reports.desc.${type}`)} · ${t("reports.rows", { n: f.num(report.rows.length) })}`}
        />
        {report.rows.length ? (
          <ReportTable report={report} t={t} locale={locale} />
        ) : (
          <EmptyState title={t("common.noResults")} description={t(`reports.desc.${type}`)} />
        )}
      </Card>
    </>
  );
}
