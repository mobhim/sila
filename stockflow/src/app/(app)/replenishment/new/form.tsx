"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Card, CardBody, Field, Select, Textarea } from "@/components/ui";
import { LineEditor } from "@/components/procurement/line-editor";
import { useI18n } from "@/i18n/client";
import { createRequestAction } from "../actions";

export function NewRequestForm({ branches, suppliers, defaultBranch }: { branches: { id: string; label: string }[]; suppliers: { id: string; label: string }[]; defaultBranch: string }) {
  const { t } = useI18n();
  const [branchId, setBranchId] = useState(defaultBranch);
  const [n, setN] = useState(0);
  return (
    <ActionForm action={createRequestAction} redirectTo={(id) => `/replenishment/${id}`}>
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t("common.branch")} htmlFor="branchId" required>
            <Select id="branchId" name="branchId" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
          <Field label={t("common.supplier")} htmlFor="supplierId" hint={t("replenishment.supplierHint")}>
            <Select id="supplierId" name="supplierId" defaultValue="">
              <option value="">{t("replenishment.noSupplier")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label={t("common.notes")} htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" maxLength={1000} />
          </Field>
        </CardBody>
      </Card>
      <Card className="mt-4">
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("common.items")}</h2>
          {/* Re-mount on branch change so stock figures always match the chosen branch. */}
          <LineEditor key={branchId} branchId={branchId} withCost availableLabel={t("replenishment.availableNow")} pickerPlaceholder={t("replenishment.addProduct")} onLinesChange={setN} />
          {!n ? <p className="mt-3 text-sm text-slate-500">{t("replenishment.noLines")}</p> : null}
        </CardBody>
      </Card>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <SubmitButton variant="secondary" name="intent" value="draft" disabled={!n}>{t("replenishment.saveDraft")}</SubmitButton>
        <SubmitButton name="intent" value="submit" disabled={!n}>{t("replenishment.saveSubmit")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
