"use client";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ui/forms";
import { Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export interface ThresholdValues { minStock: number; criticalStock: number | null; reorderQty: number; maxStock: number; safetyStock: number }

/** Edit per-branch thresholds. With `branches`, the user picks the branch (adding a product to a branch). */
export function ThresholdForm({ action, productId, branchId, values, branches }: {
  action: FormAction; productId: string; branchId?: string; values?: ThresholdValues; branches?: { id: string; label: string }[];
}) {
  const { t } = useI18n();
  const v = values ?? { minStock: 0, criticalStock: null, reorderQty: 0, maxStock: 0, safetyStock: 0 };
  const num = (n: number) => String(n);
  return (
    <ActionForm action={action} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      {branches ? (
        <Field label={t("common.branch")} required>
          <Select name="branchId" required defaultValue="">
            <option value="" disabled>{t("common.selectBranch")}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="branchId" value={branchId} />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label={t("products.minStock")}><Input name="minStock" type="number" min="0" step="any" defaultValue={num(v.minStock)} required dir="ltr" /></Field>
        <Field label={t("products.criticalStock")}><Input name="criticalStock" type="number" min="0" step="any" defaultValue={v.criticalStock === null ? "" : num(v.criticalStock)} placeholder="—" dir="ltr" title={t("products.criticalHint")} /></Field>
        <Field label={t("products.reorderQty")}><Input name="reorderQty" type="number" min="0" step="any" defaultValue={num(v.reorderQty)} required dir="ltr" /></Field>
        <Field label={t("products.maxStock")}><Input name="maxStock" type="number" min="0" step="any" defaultValue={num(v.maxStock)} required dir="ltr" /></Field>
        <Field label={t("products.safetyStock")}><Input name="safetyStock" type="number" min="0" step="any" defaultValue={num(v.safetyStock)} required dir="ltr" /></Field>
      </div>
      <p className="text-xs text-slate-500">{t("products.criticalHint")}</p>
      <SubmitButton size="sm">{t("products.saveThresholds")}</SubmitButton>
    </ActionForm>
  );
}
