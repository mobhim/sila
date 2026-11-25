"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/ui/forms";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { TempPassword } from "./temp-password";

export function ResetPassword({ action, userId }: { action: FormAction<string>; userId: string }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return (
    <ActionForm action={action} showSuccess={false}>
      {(state) =>
        state?.ok && state.data ? (
          <TempPassword password={state.data} />
        ) : (
          <div className="space-y-3">
            <input type="hidden" name="id" value={userId} />
            <p className="text-sm text-slate-600">{t("users.resetConfirm")}</p>
            {confirming ? (
              <div className="flex flex-wrap gap-2">
                <SubmitButton variant="danger" size="sm">{t("common.confirm")}</SubmitButton>
                <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
              </div>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>{t("users.resetPassword")}</Button>
            )}
          </div>
        )
      }
    </ActionForm>
  );
}
