import type { Report } from "@/server/reports";
import type { Locale, TFunction } from "@/i18n";
import { formatCell, isNumeric } from "./format";
import { Badge } from "@/components/ui";
import { TX_TONE } from "@/components/status";

const STOCK_TONE = { NORMAL: "green", LOW: "amber", CRITICAL: "orange", OUT_OF_STOCK: "red" } as const;

/** Generic report table (server component). `print` removes badges/hover styling. */
export function ReportTable({ report, t, locale, print }: { report: Report; t: TFunction; locale: Locale; print?: boolean }) {
  const cols = report.columns;
  return (
    <div className={print ? "" : "table-wrap"}>
      <table className={print ? "w-full border-collapse text-[11px]" : "tbl"}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={`${isNumeric(c) ? "text-end" : "text-start"} ${print ? "border-b border-slate-400 px-1.5 py-1 font-semibold" : ""}`}>
                {t(`reports.col.${c.label}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r, i) => (
            <tr key={i} className={print ? "break-inside-avoid" : ""}>
              {cols.map((c) => {
                const v = r[c.key];
                const text = formatCell(c, v, t, locale);
                let content: React.ReactNode = text;
                if (!print && v !== null && v !== undefined) {
                  if (c.type === "txtype") content = <Badge tone={TX_TONE[String(v)] ?? "gray"} dot={false}>{text}</Badge>;
                  else if (c.key === "state") content = <Badge tone={STOCK_TONE[String(v) as keyof typeof STOCK_TONE] ?? "gray"}>{text}</Badge>;
                }
                return (
                  <td key={c.key} className={`${isNumeric(c) ? "tnum text-end whitespace-nowrap" : ""} ${c.type === "datetime" ? "whitespace-nowrap" : ""} ${print ? "border-b border-slate-200 px-1.5 py-1" : ""}`}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {report.totals ? (
          <tfoot>
            <tr className="font-semibold">
              {cols.map((c, i) => (
                <td key={c.key} className={`${isNumeric(c) ? "tnum text-end whitespace-nowrap" : ""} border-t-2 border-slate-300 px-3 py-2.5 ${print ? "px-1.5 py-1" : "bg-slate-50"}`}>
                  {i === 0 ? t("reports.totals") : report.totals![c.key] !== undefined ? formatCell(c, report.totals![c.key], t, locale) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
