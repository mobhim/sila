"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton, fieldError, type FormAction } from "@/components/ui/forms";
import { Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea, btnClass } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import { useI18n } from "@/i18n/client";

export const UNITS = ["PIECE", "BOX", "CARTON", "KILOGRAM", "GRAM", "LITER", "MILLILITER", "BOTTLE", "PACK", "METER"] as const;

interface UnitRow { unit: string; factor: string; barcode: string; isOrderUnit: boolean }

export interface ProductFormValues {
  id?: string;
  sku: string;
  barcode: string;
  name: string;
  nameAr: string;
  description: string;
  categoryId: string;
  baseUnit: string;
  defaultSupplierId: string;
  costPrice: string;
  sellingPrice: string;
  status: "ACTIVE" | "INACTIVE";
  imageId: string | null;
  units: UnitRow[];
}

export function ProductForm({ action, values, categories, suppliers, cancelHref }: {
  action: FormAction<{ id: string }>;
  values: ProductFormValues;
  categories: { id: string; label: string }[];
  suppliers: { id: string; label: string }[];
  cancelHref: string;
}) {
  const { t } = useI18n();
  const [units, setUnits] = useState<UnitRow[]>(values.units);
  const [baseUnit, setBaseUnit] = useState(values.baseUnit);
  const update = (i: number, patch: Partial<UnitRow>) => setUnits((u) => u.map((r, j) => (j === i ? { ...r, ...patch } : patch.isOrderUnit ? { ...r, isOrderUnit: false } : r)));
  const serialised = JSON.stringify(units.filter((u) => u.unit && u.factor).map((u) => ({ unit: u.unit, factor: Number(u.factor), barcode: u.barcode || null, isOrderUnit: u.isOrderUnit })));

  return (
    <ActionForm action={action} redirectTo={(d) => `/products/${d?.id ?? ""}`}>
      {(state) => (
        <div className="grid gap-4 lg:grid-cols-3">
          {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
          <input type="hidden" name="units" value={serialised} />
          <input type="hidden" name="currentImageId" value={values.imageId ?? ""} />
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title={t("products.basicInfo")} />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <Field label={t("common.name")} htmlFor="name" required error={fieldError(state, "name")}>
                  <Input id="name" name="name" defaultValue={values.name} required maxLength={200} />
                </Field>
                <Field label={t("common.nameAr")} htmlFor="nameAr" error={fieldError(state, "nameAr")}>
                  <Input id="nameAr" name="nameAr" defaultValue={values.nameAr} maxLength={200} dir="rtl" />
                </Field>
                <Field label={t("common.sku")} htmlFor="sku" required error={fieldError(state, "sku")}>
                  <Input id="sku" name="sku" defaultValue={values.sku} required maxLength={40} dir="ltr" className="font-mono uppercase" />
                </Field>
                <Field label={t("common.barcode")} htmlFor="barcode" error={fieldError(state, "barcode")}>
                  <Input id="barcode" name="barcode" defaultValue={values.barcode} maxLength={64} dir="ltr" className="font-mono" inputMode="numeric" />
                </Field>
                <Field label={t("common.category")} htmlFor="categoryId">
                  <Select id="categoryId" name="categoryId" defaultValue={values.categoryId}>
                    <option value="">{t("products.noCategory")}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </Select>
                </Field>
                <Field label={t("products.defaultSupplier")} htmlFor="defaultSupplierId">
                  <Select id="defaultSupplierId" name="defaultSupplierId" defaultValue={values.defaultSupplierId}>
                    <option value="">{t("products.noSupplier")}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Select>
                </Field>
                <Field label={t("common.description")} htmlFor="description" className="sm:col-span-2">
                  <Textarea id="description" name="description" defaultValue={values.description} maxLength={2000} />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t("products.units")} description={t("products.unitsHint")} />
              <CardBody className="space-y-4">
                <Field label={t("products.baseUnit")} htmlFor="baseUnit" hint={t("products.baseUnitHint")} className="max-w-xs">
                  <Select id="baseUnit" name="baseUnit" value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)}>
                    {UNITS.map((u) => <option key={u} value={u}>{t(`enums.unit.${u}`)}</option>)}
                  </Select>
                </Field>
                {units.length ? (
                  <div className="space-y-3">
                    {units.map((u, i) => (
                      <div key={i} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1.3fr_auto_auto]">
                        <Field label={t("common.unit")}>
                          <Select value={u.unit} onChange={(e) => update(i, { unit: e.target.value })} aria-label={t("common.unit")}>
                            {UNITS.filter((x) => x !== baseUnit).map((x) => <option key={x} value={x}>{t(`enums.unit.${x}`)}</option>)}
                          </Select>
                        </Field>
                        <Field label={t("products.factor")}>
                          <Input type="number" min="0.0001" step="any" value={u.factor} onChange={(e) => update(i, { factor: e.target.value })} required dir="ltr" />
                        </Field>
                        <Field label={t("products.unitBarcode")} className="col-span-2 sm:col-span-1">
                          <Input value={u.barcode} onChange={(e) => update(i, { barcode: e.target.value })} dir="ltr" className="font-mono" maxLength={64} />
                        </Field>
                        <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
                          <input type="radio" name="orderUnitRadio" checked={u.isOrderUnit} onChange={() => update(i, { isOrderUnit: true })} className="accent-brand-600" />
                          {t("products.orderUnit")}
                        </label>
                        <button type="button" className={btnClass("ghost", "md", "text-rose-600")} onClick={() => setUnits((x) => x.filter((_, j) => j !== i))} aria-label={t("common.remove")}>
                          <Trash2 className="size-4" />
                        </button>
                        {u.unit && u.factor ? (
                          <p className="col-span-full text-xs text-slate-500">{t("products.conversion", { unit: t(`enums.unit.${u.unit}`), factor: u.factor, base: t(`enums.unit.${baseUnit}`) })}</p>
                        ) : null}
                      </div>
                    ))}
                    {units.some((u) => u.isOrderUnit) ? (
                      <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setUnits((x) => x.map((r) => ({ ...r, isOrderUnit: false })))}>
                        {t("products.orderUnitHint")} — {t("common.reset")}
                      </button>
                    ) : <p className="text-xs text-slate-500">{t("products.orderUnitHint")}</p>}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={btnClass("secondary", "sm")}
                  onClick={() => setUnits((x) => [...x, { unit: UNITS.find((u) => u !== baseUnit && !x.some((r) => r.unit === u)) ?? "CARTON", factor: "", barcode: "", isOrderUnit: false }])}
                >
                  <Plus className="size-3.5" /> {t("products.addUnit")}
                </button>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title={t("products.pricing")} />
              <CardBody className="space-y-4">
                <Field label={t("products.costPrice")} htmlFor="costPrice" required hint={t("products.costHint")} error={fieldError(state, "costPrice")}>
                  <Input id="costPrice" name="costPrice" type="number" min="0" step="0.01" defaultValue={values.costPrice} required dir="ltr" />
                </Field>
                <Field label={t("products.sellingPrice")} htmlFor="sellingPrice">
                  <Input id="sellingPrice" name="sellingPrice" type="number" min="0" step="0.01" defaultValue={values.sellingPrice} dir="ltr" />
                </Field>
                <Field label={t("common.status")} htmlFor="status">
                  <Select id="status" name="status" defaultValue={values.status}>
                    <option value="ACTIVE">{t("enums.recordStatus.ACTIVE")}</option>
                    <option value="INACTIVE">{t("enums.recordStatus.INACTIVE")}</option>
                  </Select>
                </Field>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("products.image")} description={t("products.imageHint")} />
              <CardBody className="space-y-3">
                {values.imageId ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/files/${values.imageId}`} alt="" className="h-32 w-full rounded-lg border border-slate-200 object-contain" />
                    <Checkbox name="removeImage" label={t("products.removeImage")} />
                  </>
                ) : null}
                <FileUpload name="imageId" accept="image/png,image/jpeg,image/webp" imagesOnly />
              </CardBody>
            </Card>
            <div className="flex gap-2">
              <SubmitButton className="flex-1">{t("common.save")}</SubmitButton>
              <a href={cancelHref} className={btnClass("secondary")}>{t("common.cancel")}</a>
            </div>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
