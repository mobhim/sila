"use client";
import { ActionForm, SubmitButton, fieldError, type FormAction } from "@/components/ui/forms";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export interface BranchDefaults {
  id?: string;
  code?: string;
  name?: string;
  nameAr?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  managerId?: string | null;
  status?: string;
  autoDraftReplenishment?: boolean;
  reviewPeriodDays?: number;
}

export function BranchForm<T>({ action, defaults = {}, managers, redirectTo }: {
  action: FormAction<T>; defaults?: BranchDefaults; managers: { id: string; name: string }[]; redirectTo?: (d: T | undefined) => string;
}) {
  const { t } = useI18n();
  return (
    <ActionForm action={action} redirectTo={redirectTo} className="space-y-4">
      {(state) => (
        <>
          {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.code")} htmlFor="code" required hint={t("branches.codeHint")} error={fieldError(state, "code")}>
              <Input id="code" name="code" defaultValue={defaults.code} required maxLength={20} dir="ltr" className="uppercase" />
            </Field>
            <Field label={t("common.status")} htmlFor="status">
              <Select id="status" name="status" defaultValue={defaults.status ?? "ACTIVE"}>
                {["ACTIVE", "INACTIVE", "CLOSED"].map((s) => <option key={s} value={s}>{t(`enums.branchStatus.${s}`)}</option>)}
              </Select>
            </Field>
            <Field label={t("common.name")} htmlFor="name" required error={fieldError(state, "name")}>
              <Input id="name" name="name" defaultValue={defaults.name} required maxLength={120} />
            </Field>
            <Field label={t("common.nameAr")} htmlFor="nameAr">
              <Input id="nameAr" name="nameAr" defaultValue={defaults.nameAr ?? ""} maxLength={120} dir="rtl" />
            </Field>
            <Field label={t("common.city")} htmlFor="city">
              <Input id="city" name="city" defaultValue={defaults.city ?? ""} maxLength={80} />
            </Field>
            <Field label={t("common.address")} htmlFor="address">
              <Input id="address" name="address" defaultValue={defaults.address ?? ""} maxLength={300} />
            </Field>
            <Field label={t("common.phone")} htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone ?? ""} maxLength={30} dir="ltr" />
            </Field>
            <Field label={t("common.email")} htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={defaults.email ?? ""} maxLength={120} dir="ltr" />
            </Field>
            <Field label={t("branches.manager")} htmlFor="managerId">
              <Select id="managerId" name="managerId" defaultValue={defaults.managerId ?? ""}>
                <option value="">{t("branches.noManager")}</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label={t("branches.reviewPeriod")} htmlFor="reviewPeriodDays" hint={t("branches.reviewPeriodHint")} error={fieldError(state, "reviewPeriodDays")}>
              <Input id="reviewPeriodDays" name="reviewPeriodDays" type="number" min={0} max={90} defaultValue={defaults.reviewPeriodDays ?? 7} required />
            </Field>
          </div>
          <input type="hidden" name="autoDraftReplenishment" value="false" />
          <Checkbox name="autoDraftReplenishment" value="true" defaultChecked={defaults.autoDraftReplenishment ?? true} label={t("branches.autoDraft")} />
          <div className="flex justify-end">
            <SubmitButton>{t("common.save")}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
