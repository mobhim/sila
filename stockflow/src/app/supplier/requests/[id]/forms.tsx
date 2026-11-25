"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Checkbox, Field, Input, Textarea } from "@/components/ui";
import { QtyLines, type QtyLine } from "@/components/procurement/qty-lines-form";
import { FileUpload } from "@/components/file-upload";
import { useI18n } from "@/i18n/client";
import { acceptAction, updateAction } from "../../actions";
import { addDocumentAction } from "@/app/(app)/replenishment/actions";

export function AcceptForm({ id, minDate }: { id: string; minDate: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={acceptAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("supplierPortal.expectedDelivery")} htmlFor="expectedAt" required>
          <Input id="expectedAt" name="expectedAt" type="date" min={minDate} required />
        </Field>
        <Field label={t("supplierPortal.noteToBranch")} htmlFor="note">
          <Input id="note" name="note" maxLength={500} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="success">{t("supplierPortal.accept")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function UpdateForm({ id, lines, canTransit, expected }: { id: string; lines: QtyLine[]; canTransit: boolean; expected: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <QtyLines lines={lines} inputLabel={t("supplierPortal.confirmedQty")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("supplierPortal.expectedDelivery")} htmlFor="uexpected">
          <Input id="uexpected" name="expectedAt" type="date" defaultValue={expected} />
        </Field>
        <Field label={t("supplierPortal.noteToBranch")} htmlFor="unote">
          <Textarea id="unote" name="note" maxLength={1000} className="min-h-10" />
        </Field>
      </div>
      {canTransit ? <Checkbox name="inTransit" label={t("supplierPortal.markInTransit")} /> : null}
      <div className="flex justify-end">
        <SubmitButton>{t("supplierPortal.saveUpdate")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SupplierDocumentForm({ id }: { id: string }) {
  const { t } = useI18n();
  const [k, setK] = useState(0);
  return (
    <ActionForm action={addDocumentAction} resetOnSuccess onSuccess={() => setK((x) => x + 1)} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FileUpload key={k} label={t("supplierPortal.uploadDoc")} />
      <div className="flex gap-2">
        <Input name="label" placeholder={t("supplierPortal.docLabel")} maxLength={120} />
        <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
