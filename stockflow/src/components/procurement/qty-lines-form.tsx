"use client";
import { useI18n } from "@/i18n/client";

export interface QtyLine {
  id: string;
  name: string;
  sku: string;
  unit: string;
  /** Reference column values shown before the input. */
  info: { label: string; value: number }[];
  defaultValue: number;
  max?: number;
}

/** Table of per-line quantity inputs named `qty_<id>` (used for receiving, dispatch, confirmation). */
export function QtyLines({ lines, inputLabel }: { lines: QtyLine[]; inputLabel: string }) {
  const { t, num } = useI18n();
  const heads = lines[0]?.info.map((i) => i.label) ?? [];
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("common.product")}</th>
            {heads.map((h) => <th key={h} className="text-end">{h}</th>)}
            <th className="w-36">{inputLabel}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <p className="font-medium text-slate-800">{l.name}</p>
                <p className="text-xs text-slate-500" dir="ltr">{l.sku}</p>
              </td>
              {l.info.map((i) => <td key={i.label} className="tnum text-end">{num(i.value)} <span className="text-xs text-slate-400">{t(`enums.unit.${l.unit}`)}</span></td>)}
              <td>
                <input
                  name={`qty_${l.id}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={l.max}
                  step="any"
                  defaultValue={l.defaultValue}
                  aria-label={`${inputLabel} — ${l.name}`}
                  className="input tnum"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
