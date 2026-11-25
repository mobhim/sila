"use client";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/forms";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { saveProfileAction } from "./actions";

export function ProfileForm({ v }: { v: { name: string; phone: string | null; locale: string; notifyEmail: boolean; notifyWhatsapp: boolean; notifySms: boolean } }) {
  const { t } = useI18n();
  const toggle = (name: string, checked: boolean, label: string) => (
    <div>
      <input type="hidden" name={name} value="false" />
      <Checkbox name={name} value="true" defaultChecked={checked} label={label} />
    </div>
  );
  return (
    <ActionForm action={saveProfileAction} className="space-y-4">
      {(state) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("common.name")} htmlFor="name" required error={fieldError(state, "name")}>
              <Input id="name" name="name" defaultValue={v.name} required maxLength={120} />
            </Field>
            <Field label={t("common.phone")} htmlFor="phone" hint={t("profile.phoneHint")} error={fieldError(state, "phone")}>
              <Input id="phone" name="phone" type="tel" defaultValue={v.phone ?? ""} maxLength={20} dir="ltr" />
            </Field>
            <Field label={t("common.language")} htmlFor="locale">
              <Select id="locale" name="locale" defaultValue={v.locale}>
                <option value="ar">{t("common.arabic")}</option>
                <option value="en">{t("common.english")}</option>
              </Select>
            </Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="label">{t("profile.notifications")}</legend>
            {toggle("notifyEmail", v.notifyEmail, t("profile.notifyEmail"))}
            {toggle("notifyWhatsapp", v.notifyWhatsapp, t("profile.notifyWhatsapp"))}
            {toggle("notifySms", v.notifySms, t("profile.notifySms"))}
            <p className="text-xs text-slate-500">{t("profile.notifyHint")}</p>
          </fieldset>
          <div className="flex justify-end"><SubmitButton>{t("common.save")}</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}
