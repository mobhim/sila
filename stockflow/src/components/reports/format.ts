import type { Column } from "@/server/reports";
import type { Locale, TFunction } from "@/i18n";
import * as f from "@/i18n/format";

const STATUS_NS: Record<string, string> = {
  role: "enums.role",
  status: "enums.replenishment",
  source: "enums.source",
  state: "enums.stock",
};

/** Format a report cell as plain text (shared by screen, print and CSV). */
export function formatCell(col: Column, v: unknown, t: TFunction, locale: Locale, opts: { csv?: boolean } = {}): string {
  if (v === null || v === undefined || v === "") return opts.csv ? "" : "—";
  switch (col.type) {
    case "number":
      return opts.csv ? String(Math.round(Number(v) * 1000) / 1000) : f.fmtNumber(Number(v), locale, 2);
    case "money":
      return opts.csv ? (Math.round(Number(v) * 100) / 100).toFixed(2) : f.fmtMoney(Number(v), locale);
    case "percent":
      return opts.csv ? (Math.round(Number(v) * 10000) / 100).toFixed(2) + "%" : f.fmtPercent(Number(v), locale);
    case "date":
      return opts.csv ? f.isoDay(new Date(v as string)) : f.fmtDate(v as Date, locale);
    case "datetime":
      return opts.csv ? new Date(v as string).toISOString() : f.fmtDateTime(v as Date, locale);
    case "txtype":
      return t(`enums.tx.${v}`);
    case "unit":
      return t(`enums.unit.${v}`);
    case "status":
      if (col.key === "pending") return t(`reports.${v}`);
      return STATUS_NS[col.key] ? t(`${STATUS_NS[col.key]}.${v}`) : String(v);
    default:
      return String(v);
  }
}

export const isNumeric = (c: Column) => c.type === "number" || c.type === "money" || c.type === "percent";
