import { requireActor } from "@/server/auth/current";
import { runReport } from "@/server/reports";
import { parseReportParams, REPORT_FILTERS } from "@/server/report-filters";
import { getSelectedBranch } from "@/server/branch-selection";
import { getSettings } from "@/server/settings";
import { db } from "@/server/db";
import { getFmt } from "@/i18n/server";
import { ReportTable } from "@/components/reports/table";
import { PrintButton } from "@/components/reports/print-button";
import { bname } from "@/components/status";

export const metadata = { title: "Report" };

export default async function PrintReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor("reports.view");
  const sp = await searchParams;
  const parsed = parseReportParams(sp, await getSelectedBranch(actor));
  const { type, filters } = parsed;
  const show = REPORT_FILTERS[type];
  const [report, settings] = await Promise.all([runReport(actor, type, filters), getSettings()]);
  const f = await getFmt();
  const { t, locale } = f;

  // Names for the filter summary (the report itself already enforced access).
  const [branch, product, category, user] = await Promise.all([
    filters.branchId ? db.branch.findUnique({ where: { id: filters.branchId }, select: { name: true, nameAr: true, code: true } }) : null,
    filters.productId && show.product ? db.product.findUnique({ where: { id: filters.productId }, select: { name: true, nameAr: true, sku: true } }) : null,
    filters.categoryId && show.category ? db.productCategory.findUnique({ where: { id: filters.categoryId }, select: { name: true, nameAr: true } }) : null,
    filters.userId && show.user ? db.user.findUnique({ where: { id: filters.userId }, select: { name: true } }) : null,
  ]);
  const now = new Date();
  const summary: [string, string][] = [];
  if (show.dates) summary.push([t("reports.period"), `${f.date(filters.from)} – ${f.date(new Date(filters.to.getTime() - 1))}`]);
  else summary.push([t("reports.period"), t("reports.currentSnapshot")]);
  if (show.branch) summary.push([t("common.branch"), branch ? `${bname(branch, locale)} · ${branch.code}` : t("common.allBranches")]);
  if (product) summary.push([t("common.product"), `${bname(product, locale)} (${product.sku})`]);
  if (category) summary.push([t("common.category"), bname(category, locale)]);
  if (user) summary.push([t("reports.employee"), user.name]);
  if (filters.type && show.txType) summary.push([t("reports.txType"), t(`enums.tx.${filters.type}`)]);

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6 print:max-w-none print:p-0">
      <div className="no-print mb-5 flex justify-end">
        <PrintButton label={t("reports.printPdf")} />
      </div>
      <header className="mb-4 flex items-start justify-between gap-6 border-b-2 border-slate-800 pb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{settings.businessName}{settings.vatNumber ? ` · VAT ${settings.vatNumber}` : ""}</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{t(`reports.types.${type}`)}</h1>
          <p className="text-xs text-slate-600">{t(`reports.desc.${type}`)}</p>
        </div>
        <div className="text-end text-xs text-slate-600">
          <p>{t("reports.generatedAt")}: {f.dateTime(now)}</p>
          {f.showHijri ? <p>{f.hijri(now)}</p> : null}
          <p>{t("reports.generatedBy")} {actor.name}</p>
        </div>
      </header>
      <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        {summary.map(([k, v]) => (
          <div key={k} className="flex gap-1.5"><dt className="text-slate-500">{k}:</dt><dd className="font-medium text-slate-800">{v}</dd></div>
        ))}
        <div className="flex gap-1.5"><dt className="text-slate-500">{t("common.total")}:</dt><dd className="font-medium text-slate-800">{t("reports.rows", { n: f.num(report.rows.length) })}</dd></div>
      </dl>
      {report.truncated ? <p className="mb-3 text-xs text-amber-700">{t("reports.truncated")}</p> : null}
      {report.rows.length ? <ReportTable report={report} t={t} locale={locale} print /> : <p className="py-10 text-center text-sm text-slate-500">{t("common.noResults")}</p>}
      <footer className="mt-6 border-t border-slate-200 pt-2 text-[10px] text-slate-400">{t("app.name")} · {settings.businessName}</footer>
    </div>
  );
}
