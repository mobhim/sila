"use client";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/forms";
import { useI18n } from "@/i18n/client";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  const { t } = useI18n();
  return (
    <form action={action} className="mt-8 space-y-4">
      {state && !state.ok ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <Field label={t("common.email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required dir="ltr" className="text-start" />
      </Field>
      <Field label={t("auth.password")} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" className="text-start" />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingLabel={t("auth.signingIn")}>{t("auth.signIn")}</SubmitButton>
      <p className="text-center text-xs text-slate-500">{t("auth.forgot")}</p>
    </form>
  );
}
