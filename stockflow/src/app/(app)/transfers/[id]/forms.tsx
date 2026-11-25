"use client";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Field, Textarea } from "@/components/ui";
import { QtyLines, type QtyLine } from "@/components/procurement/qty-lines-form";
import { useI18n } from "@/i18n/client";
import { dispatchTransferAction, receiveTransferAction } from "../actions";

export function TransferQtyForm({ id, mode, lines }: { id: string; mode: "dispatch" | "receive"; lines: QtyLine[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={mode === "dispatch" ? dispatchTransferAction : receiveTransferAction} idempotent className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <QtyLines lines={lines} inputLabel={mode === "dispatch" ? t("transfers.dispatchQty") : t("transfers.receiveQty")} />
      <Field label={t("common.notes")} htmlFor={`${mode}-notes`}>
        <Textarea id={`${mode}-notes`} name="notes" maxLength={500} className="min-h-10" />
      </Field>
      <p className="text-xs text-slate-500">{mode === "dispatch" ? t("transfers.dispatchHint") : t("transfers.receiveHint")}</p>
      <div className="flex justify-end">
        <SubmitButton variant={mode === "dispatch" ? "primary" : "success"}>{mode === "dispatch" ? t("transfers.act.dispatch") : t("transfers.act.receive")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
