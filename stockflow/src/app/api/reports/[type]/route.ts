import { api } from "@/server/api";
import { notFound } from "@/server/errors";
import { REPORT_TYPES, runReport, toCsv, type ReportType } from "@/server/reports";
import { parseReportParams } from "@/server/report-filters";
import { getSelectedBranch } from "@/server/branch-selection";
import { audit } from "@/server/audit";
import { makeT, type Locale } from "@/i18n";
import { formatCell } from "@/components/reports/format";

/** GET /api/reports/:type?from=&to=&branch=… — CSV export (UTF-8 with BOM). */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  return api(async (actor) => {
    const { type } = await params;
    if (!(REPORT_TYPES as readonly string[]).includes(type)) throw notFound();
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const parsed = parseReportParams({ ...sp, type }, await getSelectedBranch(actor));
    const report = await runReport(actor, type as ReportType, parsed.filters);
    const locale = (actor.locale === "en" ? "en" : "ar") as Locale;
    const t = makeT(locale);
    const csv = toCsv(report, (k) => t(`reports.col.${k}`), (col, v) => formatCell(col, v, t, locale, { csv: true }));
    await audit(actor, {
      action: "report.export",
      entityType: "report",
      entityId: type,
      branchId: parsed.filters.branchId ?? null,
      summary: `${type} ${parsed.fromDay}..${parsed.toDay} (${report.rows.length} rows)`,
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stockflow-${type}-${parsed.fromDay}-${parsed.toDay}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
