"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Field, Select, Textarea, Input } from "@/components/ui";
import { LineEditor, type EditorLine } from "@/components/procurement/line-editor";
import { QtyLines, type QtyLine } from "@/components/procurement/qty-lines-form";
import { FileUpload } from "@/components/file-upload";
import { useI18n } from "@/i18n/client";
import { addDocumentAction, receiveRequestAction, updateRequestAction } from "../actions";

export function EditRequestForm({ id, branchId, supplierId, notes, suppliers, lines }: {
  id: string; branchId: string; supplierId: string | null; notes: string | null; suppliers: { id: string; label: string }[]; lines: EditorLine[];
}) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateRequestAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.supplier")} htmlFor="supplierId">
          <Select id="supplierId" name="supplierId" defaultValue={supplierId ?? ""}>
            <option value="">{t("replenishment.noSupplier")}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label={t("common.notes")} htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={notes ?? ""} maxLength={1000} className="min-h-10" />
        </Field>
      </div>
      <LineEditor initial={lines} branchId={branchId} withCost availableLabel={t("replenishment.availableNow")} pickerPlaceholder={t("replenishment.addProduct")} />
      <div className="flex justify-end">
        <SubmitButton>{t("replenishment.saveChanges")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ReceiveForm({ id, lines }: { id: string; lines: QtyLine[] }) {
  const { t } = useI18n();
  const [k, setK] = useState(0);
  return (
    <ActionForm action={receiveRequestAction} idempotent resetOnSuccess onSuccess={() => setK((x) => x + 1)} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <QtyLines lines={lines} inputLabel={t("replenishment.receivedNow")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.notes")} htmlFor="rnotes">
          <Textarea id="rnotes" name="notes" maxLength={1000} className="min-h-10" />
        </Field>
        <Field label={t("replenishment.deliveryNote")}>
          <FileUpload key={k} capture />
        </Field>
      </div>
      <p className="text-xs text-slate-500">{t("replenishment.receiveHint")}</p>
      <div className="flex justify-end">
        <SubmitButton variant="success">{t("replenishment.confirmReceipt")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DocumentForm({ id }: { id: string }) {
  const { t } = useI18n();
  const [k, setK] = useState(0);
  return (
    <ActionForm action={addDocumentAction} resetOnSuccess onSuccess={() => setK((x) => x + 1)} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <FileUpload key={k} />
      <div className="flex gap-2">
        <Input name="label" placeholder={t("replenishment.docLabel")} maxLength={120} />
        <SubmitButton variant="secondary">{t("common.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
