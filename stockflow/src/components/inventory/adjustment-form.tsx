"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ui/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { ProductPicker, type PickerProduct } from "@/components/product-picker";
import { FileUpload } from "@/components/file-upload";
import { useI18n } from "@/i18n/client";

const KINDS = ["DAMAGED", "EXPIRED", "MISSING", "CORRECTION"] as const;

export function AdjustmentForm({ action, branches, defaultBranchId }: { action: FormAction; branches: { id: string; label: string }[]; defaultBranchId: string | null }) {
  const { t, num, locale } = useI18n();
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? "");
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("DAMAGED");
  const [formKey, setFormKey] = useState(0);

  return (
    <ActionForm action={action} idempotent onSuccess={() => { setProduct(null); setFormKey((k) => k + 1); }} className="space-y-4">
      <div key={formKey} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.branch")} required>
            <Select name="branchId" value={branchId} onChange={(e) => { setBranchId(e.target.value); setProduct(null); }} required>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
          <Field label={t("adjustments.kind")} required>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`enums.adjustmentKind.${k}`)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t("adjustments.product")} required>
          <input type="hidden" name="productId" value={product?.id ?? ""} />
          {product ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-brand-900">{locale === "ar" ? product.nameAr || product.name : product.name}</span>
                <span className="text-xs text-brand-700">{t("adjustments.available", { qty: `${num(product.available)} ${t(`enums.unit.${product.baseUnit}`)}` })}</span>
              </span>
              <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setProduct(null)}>{t("adjustments.change")}</button>
            </div>
          ) : (
            <ProductPicker branchId={branchId} onPick={setProduct} placeholder={t("adjustments.pickProduct")} />
          )}
        </Field>
        <Field
          label={`${t("adjustments.qty")}${product ? ` (${t(`enums.unit.${product.baseUnit}`)})` : ""}`}
          required
          hint={kind === "CORRECTION" ? t("adjustments.correctionHint") : t("adjustments.qtyHint")}
        >
          <Input name="quantity" type="number" step="any" min={kind === "CORRECTION" ? undefined : "0.001"} required dir="ltr" inputMode="decimal" />
        </Field>
        <Field label={t("adjustments.reason")} required>
          <Input name="reason" required maxLength={500} />
        </Field>
        <Field label={t("common.notes")}>
          <Textarea name="notes" maxLength={2000} />
        </Field>
        <Field label={t("common.attachment")}>
          <FileUpload capture />
        </Field>
      </div>
      <SubmitButton disabled={!product}>{t("adjustments.submit")}</SubmitButton>
    </ActionForm>
  );
}
