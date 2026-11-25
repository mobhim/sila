"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, fieldError } from "@/components/ui/forms";
import { Alert, Checkbox, Field, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { requeueAction, saveSettingsAction } from "./actions";

export interface SettingsValues {
  businessName: string; vatNumber: string | null; allowNegativeStock: boolean; criticalPercent: number; consumptionWindowDays: number; safetyDays: number;
  autoDraftReplenishment: boolean; autoApproveReplenishment: boolean; showHijri: boolean; emailEnabled: boolean; whatsappEnabled: boolean; smsEnabled: boolean;
}

function Toggle({ name, checked, label, hint, onChange }: { name: string; checked: boolean; label: string; hint?: string; onChange?: (v: boolean) => void }) {
  return (
    <div>
      <input type="hidden" name={name} value="false" />
      <Checkbox name={name} value="true" defaultChecked={checked} label={label} onChange={(e) => onChange?.(e.target.checked)} />
      {hint ? <p className="ms-6 mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SettingsForm({ v }: { v: SettingsValues }) {
  const { t } = useI18n();
  const [autoApprove, setAutoApprove] = useState(v.autoApproveReplenishment);
  const section = "space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5";
  return (
    <ActionForm action={saveSettingsAction} className="space-y-4">
      {(state) => (
        <>
          <section className={section}>
            <h2 className="text-sm font-semibold text-slate-900">{t("settings.business")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.businessName")} htmlFor="businessName" required error={fieldError(state, "businessName")}>
                <Input id="businessName" name="businessName" defaultValue={v.businessName} required maxLength={160} />
              </Field>
              <Field label={t("settings.vat")} htmlFor="vatNumber">
                <Input id="vatNumber" name="vatNumber" defaultValue={v.vatNumber ?? ""} maxLength={30} dir="ltr" />
              </Field>
            </div>
            <p className="text-xs text-slate-500">{t("settings.currency")}</p>
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-slate-900">{t("settings.inventory")}</h2>
            <Toggle name="allowNegativeStock" checked={v.allowNegativeStock} label={t("settings.allowNegative")} hint={t("settings.allowNegativeHint")} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("settings.criticalPercent")} htmlFor="criticalPercent" hint={t("settings.criticalPercentHint")}>
                <Input id="criticalPercent" name="criticalPercent" type="number" min={1} max={100} defaultValue={v.criticalPercent} required />
              </Field>
              <Field label={t("settings.window")} htmlFor="consumptionWindowDays">
                <Input id="consumptionWindowDays" name="consumptionWindowDays" type="number" min={1} max={365} defaultValue={v.consumptionWindowDays} required />
              </Field>
              <Field label={t("settings.safetyDays")} htmlFor="safetyDays" hint={t("settings.safetyDaysHint")}>
                <Input id="safetyDays" name="safetyDays" type="number" min={0} max={90} defaultValue={v.safetyDays} required />
              </Field>
            </div>
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-slate-900">{t("settings.replenishment")}</h2>
            <Toggle name="autoDraftReplenishment" checked={v.autoDraftReplenishment} label={t("settings.autoDraft")} />
            <Toggle name="autoApproveReplenishment" checked={v.autoApproveReplenishment} label={t("settings.autoApprove")} onChange={setAutoApprove} />
            <Alert tone={autoApprove ? "error" : "warn"}>{t("settings.autoApproveWarn")}</Alert>
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-slate-900">{t("settings.display")}</h2>
            <Toggle name="showHijri" checked={v.showHijri} label={t("settings.showHijri")} />
          </section>

          <section className={section}>
            <h2 className="text-sm font-semibold text-slate-900">{t("settings.channels")}</h2>
            <p className="text-xs text-slate-500">{t("settings.channelsHint")}</p>
            <Toggle name="emailEnabled" checked={v.emailEnabled} label={t("enums.channel.EMAIL")} />
            <Toggle name="whatsappEnabled" checked={v.whatsappEnabled} label={t("enums.channel.WHATSAPP")} />
            <Toggle name="smsEnabled" checked={v.smsEnabled} label={t("enums.channel.SMS")} />
          </section>

          <div className="flex justify-end"><SubmitButton>{t("common.save")}</SubmitButton></div>
        </>
      )}
    </ActionForm>
  );
}

export function RequeueButton({ channel }: { channel: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={requeueAction} showSuccess={false}>
      {(state) => (
        <div className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="channel" value={channel} />
          <SubmitButton variant="secondary" size="sm">{t("settings.requeue")}</SubmitButton>
          {state?.ok ? <span className="text-xs text-emerald-700">{state.data}</span> : null}
        </div>
      )}
    </ActionForm>
  );
}
