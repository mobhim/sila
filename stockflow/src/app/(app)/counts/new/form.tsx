"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Field, Select, Textarea } from "@/components/ui";
import { ProductPicker, type PickerProduct } from "@/components/product-picker";
import { useI18n } from "@/i18n/client";
import { createCountAction } from "../actions";

export function NewCountForm({ branches, categories, defaultBranch }: { branches: { id: string; label: string }[]; categories: { id: string; label: string }[]; defaultBranch: string }) {
  const { t, locale } = useI18n();
  const [branch, setBranch] = useState(defaultBranch);
  const [picked, setPicked] = useState<PickerProduct[]>([]);
  return (
    <ActionForm action={createCountAction} redirectTo={(id) => `/counts/${id}`} className="space-y-4">
      <Field label={t("common.branch")} htmlFor="branchId" required>
        <Select id="branchId" name="branchId" value={branch} onChange={(e) => { setBranch(e.target.value); setPicked([]); }} required>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </Select>
      </Field>
      <Field label={t("common.category")} htmlFor="categoryId" hint={t("common.optional")}>
        <Select id="categoryId" name="categoryId" defaultValue="">
          <option value="">{t("counts.allProducts")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>
      <Field label={t("counts.specificProducts")} hint={t("counts.specificHint")}>
        <ProductPicker branchId={branch} onPick={(p) => setPicked((x) => [...x, p])} exclude={picked.map((p) => p.id)} placeholder={t("counts.addProduct")} />
        {picked.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {picked.map((p) => (
              <li key={p.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pe-1 ps-3 text-xs text-slate-700">
                <input type="hidden" name="productIds[]" value={p.id} />
                {locale === "ar" ? p.nameAr || p.name : p.name}
                <button type="button" className="grid size-5 place-items-center rounded-full hover:bg-slate-200" onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))} aria-label={t("common.remove")}>
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Field>
      <Field label={t("common.notes")} htmlFor="notes" hint={t("common.optional")}>
        <Textarea id="notes" name="notes" maxLength={1000} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>{t("counts.start")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
