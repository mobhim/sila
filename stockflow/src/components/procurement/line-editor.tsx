"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ProductPicker } from "@/components/product-picker";
import { useI18n } from "@/i18n/client";

export interface EditorLine {
  productId: string;
  name: string;
  nameAr: string | null;
  sku: string;
  baseUnit: string;
  available: number | null;
  quantity: number | string;
  unitCost?: number | string;
}

/**
 * Editable product lines. Submits a hidden JSON field `items`:
 * [{ productId, quantity, unitCost? }].
 */
export function LineEditor({
  initial = [], branchId, withCost, availableLabel, pickerPlaceholder, onLinesChange,
}: {
  initial?: EditorLine[];
  branchId?: string | null;
  withCost?: boolean;
  availableLabel?: string;
  pickerPlaceholder?: string;
  onLinesChange?: (n: number) => void;
}) {
  const { t, num, money, locale } = useI18n();
  const [lines, setLines] = useState<EditorLine[]>(initial);
  const update = (next: EditorLine[]) => {
    setLines(next);
    onLinesChange?.(next.length);
  };
  const payload = lines.map((l) => ({
    productId: l.productId,
    quantity: Number(l.quantity),
    ...(withCost ? { unitCost: Number(l.unitCost ?? 0) } : {}),
  }));
  const total = withCost ? lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0) : 0;

  return (
    <div className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <ProductPicker
        branchId={branchId}
        placeholder={pickerPlaceholder}
        exclude={lines.map((l) => l.productId)}
        onPick={(p) =>
          update([...lines, { productId: p.id, name: p.name, nameAr: p.nameAr, sku: p.sku, baseUnit: p.baseUnit, available: p.available, quantity: "", unitCost: "" }])
        }
      />
      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t("common.product")}</th>
                {availableLabel ? <th className="text-end">{availableLabel}</th> : null}
                <th className="w-32">{t("common.quantity")}</th>
                {withCost ? <th className="w-32">{t("common.unitCost")}</th> : null}
                {withCost ? <th className="text-end">{t("common.value")}</th> : null}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.productId}>
                  <td>
                    <p className="font-medium text-slate-800">{locale === "ar" ? l.nameAr || l.name : l.name}</p>
                    <p className="text-xs text-slate-500" dir="ltr">{l.sku}</p>
                  </td>
                  {availableLabel ? (
                    <td className="tnum text-end text-slate-600">{l.available === null ? "—" : `${num(l.available)} ${t(`enums.unit.${l.baseUnit}`)}`}</td>
                  ) : null}
                  <td>
                    <input
                      className="input tnum"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      required
                      aria-label={t("common.quantity")}
                      value={l.quantity}
                      onChange={(e) => update(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                    />
                  </td>
                  {withCost ? (
                    <td>
                      <input
                        className="input tnum"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        aria-label={t("common.unitCost")}
                        value={l.unitCost ?? ""}
                        onChange={(e) => update(lines.map((x, j) => (j === i ? { ...x, unitCost: e.target.value } : x)))}
                      />
                    </td>
                  ) : null}
                  {withCost ? <td className="tnum text-end">{money((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</td> : null}
                  <td>
                    <button type="button" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => update(lines.filter((_, j) => j !== i))} aria-label={t("common.remove")}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {withCost ? (
              <tfoot>
                <tr>
                  <td colSpan={availableLabel ? 4 : 3} className="px-3 py-2 text-end text-sm font-medium text-slate-600">{t("common.total")}</td>
                  <td className="tnum px-3 py-2 text-end font-semibold">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : null}
    </div>
  );
}
