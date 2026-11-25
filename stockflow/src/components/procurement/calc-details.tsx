import type { Fmt } from "@/i18n/server";

interface Calc {
  recommended?: number;
  safety?: number;
  cover?: number;
  target?: number;
  needed?: number;
  input?: {
    available?: number; onOrder?: number; minStock?: number; reorderQty?: number; maxStock?: number;
    avgDailyConsumption?: number; leadTimeDays?: number; reviewPeriodDays?: number; orderMultiple?: number;
  };
}

/** Explains how a recommended quantity was computed (stored on the request item). */
export function CalcDetails({ calc, f, unit }: { calc: unknown; f: Fmt; unit: string }) {
  const c = (calc ?? null) as Calc | null;
  if (!c || typeof c !== "object" || !c.input) return null;
  const { t } = f;
  const i = c.input;
  const rows: [string, string][] = [
    [t("replenishment.calc.available"), f.num(i.available)],
    [t("replenishment.calc.onOrder"), f.num(i.onOrder)],
    [t("replenishment.calc.min"), f.num(i.minStock)],
    [t("replenishment.calc.max"), f.num(i.maxStock)],
    [t("replenishment.calc.adc"), `${f.num(i.avgDailyConsumption)}${t("common.perDay")}`],
    [t("replenishment.calc.lead"), t("common.days", { n: f.num(i.leadTimeDays) })],
    [t("replenishment.calc.review"), t("common.days", { n: f.num(i.reviewPeriodDays) })],
    [t("replenishment.calc.safety"), f.num(c.safety)],
    [t("replenishment.calc.cover"), f.num(c.cover)],
    [t("replenishment.calc.target"), f.num(c.target)],
    [t("replenishment.calc.needed"), f.num(c.needed)],
    [t("replenishment.calc.reorderQty"), f.num(i.reorderQty)],
    [t("replenishment.calc.multiple"), f.num(i.orderMultiple)],
  ];
  return (
    <details className="group mt-1 text-xs">
      <summary className="cursor-pointer select-none text-brand-700 hover:underline">{t("replenishment.calc.how")}</summary>
      <div className="mt-2 w-64 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        <dl className="space-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-500">{k}</dt>
              <dd className="tnum font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 border-t border-slate-200 pt-2 leading-relaxed text-slate-600">
          {t("replenishment.calc.formula", { unit: t(`enums.unit.${unit}`) })}
        </p>
      </div>
    </details>
  );
}
