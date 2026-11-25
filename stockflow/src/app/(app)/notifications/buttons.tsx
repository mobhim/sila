"use client";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { useI18n } from "@/i18n/client";
import { markReadAction } from "./actions";

export function MarkRead({ id, all }: { id?: string; all?: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={markReadAction} showSuccess={false}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <SubmitButton variant={all ? "secondary" : "ghost"} size="sm" pendingLabel="…">{all ? t("notifications.markAllRead") : t("notifications.markRead")}</SubmitButton>
    </ActionForm>
  );
}
