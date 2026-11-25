"use client";
import { ActionForm, SubmitButton, fieldError, type FormAction } from "@/components/ui/forms";
import { Checkbox, Field, Input, Textarea } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export interface SupplierDefaults {
  id?: string; code?: string; name?: string; contactName?: string | null; phone?: string | null; whatsapp?: string | null; email?: string | null;
  address?: string | null; vatNumber?: string | null; leadTimeDays?: number; status?: string; notes?: string | null;
}

export function SupplierForm({ action, defaults = {} }: { action: FormAction<string>; defaults?: SupplierDefaults }) {
  const { t } = useI18n();
  return (
    <ActionForm action={action} redirectTo={defaults.id ? undefined : (id) => `/suppliers/${id}`} className="space-y-4">
      {(state) => (
        <>
          {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.code")} htmlFor="code" required error={fieldError(state, "code")}>
              <Input id="code" name="code" defaultValue={defaults.code} required maxLength={20} dir="ltr" className="uppercase" />
            </Field>
            <Field label={t("common.name")} htmlFor="name" required error={fieldError(state, "name")}>
              <Input id="name" name="name" defaultValue={defaults.name} required maxLength={160} />
            </Field>
            <Field label={t("suppliers.contactName")} htmlFor="contactName">
              <Input id="contactName" name="contactName" defaultValue={defaults.contactName ?? ""} maxLength={120} />
            </Field>
            <Field label={t("common.email")} htmlFor="email" error={fieldError(state, "email")}>
              <Input id="email" name="email" type="email" defaultValue={defaults.email ?? ""} maxLength={200} dir="ltr" />
            </Field>
            <Field label={t("common.phone")} htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone ?? ""} maxLength={30} dir="ltr" />
            </Field>
            <Field label={t("suppliers.whatsapp")} htmlFor="whatsapp">
              <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={defaults.whatsapp ?? ""} maxLength={30} dir="ltr" />
            </Field>
            <Field label={t("suppliers.vat")} htmlFor="vatNumber">
              <Input id="vatNumber" name="vatNumber" defaultValue={defaults.vatNumber ?? ""} maxLength={30} dir="ltr" />
            </Field>
            <Field label={t("suppliers.leadTime")} htmlFor="leadTimeDays" hint={t("suppliers.leadTimeHint")} error={fieldError(state, "leadTimeDays")}>
              <Input id="leadTimeDays" name="leadTimeDays" type="number" min={0} max={365} defaultValue={defaults.leadTimeDays ?? 3} required />
            </Field>
            <Field label={t("common.address")} htmlFor="address" className="sm:col-span-2">
              <Input id="address" name="address" defaultValue={defaults.address ?? ""} maxLength={300} />
            </Field>
            <Field label={t("common.notes")} htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ""} maxLength={2000} />
            </Field>
          </div>
          <input type="hidden" name="active" value="false" />
          <Checkbox name="active" value="true" defaultChecked={(defaults.status ?? "ACTIVE") === "ACTIVE"} label={t("common.active")} />
          <div className="flex justify-end"><SubmitButton>{t("common.save")}</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
