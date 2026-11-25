"use client";
import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/forms";
import { useI18n } from "@/i18n/client";

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  const { t } = useI18n();
  return (
    <form action={action} className="mt-8 space-y-4">
      {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label={t("auth.currentPassword")} htmlFor="current">
        <Input id="current" name="current" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      <Field label={t("auth.newPassword")} htmlFor="next" hint={t("auth.passwordRule")}>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required dir="ltr" />
      </Field>
      <Field label={t("auth.confirmPassword")} htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required dir="ltr" />
      </Field>
      <SubmitButton className="w-full" size="lg">{t("auth.updatePassword")}</SubmitButton>
    </form>
  );
}
