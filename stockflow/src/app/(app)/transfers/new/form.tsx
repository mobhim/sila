"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Alert, Card, CardBody, Field, Select, Textarea } from "@/components/ui";
import { LineEditor } from "@/components/procurement/line-editor";
import { useI18n } from "@/i18n/client";
import { createTransferAction } from "../actions";

type Opt = { id: string; label: string; mine: boolean };

export function NewTransferForm({ branches, defaultSource }: { branches: Opt[]; defaultSource: string }) {
  const { t } = useI18n();
  const [source, setSource] = useState(defaultSource);
  const [dest, setDest] = useState(() => branches.find((b) => b.id !== defaultSource)?.id ?? "");
  const [n, setN] = useState(0);
  const sourceMine = branches.find((b) => b.id === source)?.mine ?? false;
  const destMine = branches.find((b) => b.id === dest)?.mine ?? false;
  const allowed = source && dest && source !== dest && (sourceMine || destMine);
  // Stock figures are shown only for a branch the user may see.
  const stockBranch = sourceMine ? source : destMine ? dest : null;

  return (
    <ActionForm action={createTransferAction} redirectTo={(id) => `/transfers/${id}`}>
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t("transfers.source")} htmlFor="sourceBranchId" required>
            <Select id="sourceBranchId" name="sourceBranchId" value={source} onChange={(e) => setSource(e.target.value)} required>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </Select>
          </Field>
          <Field label={t("transfers.destination")} htmlFor="destinationBranchId" required>
            <Select id="destinationBranchId" name="destinationBranchId" value={dest} onChange={(e) => setDest(e.target.value)} required>
              {branches.map((b) => <option key={b.id} value={b.id} disabled={b.id === source}>{b.label}</option>)}
            </Select>
          </Field>
          {source === dest ? <Alert tone="error" className="sm:col-span-2">{t("errors.same_branch")}</Alert> : null}
          {source !== dest && !sourceMine && !destMine ? <Alert tone="error" className="sm:col-span-2">{t("transfers.mustInvolveYours")}</Alert> : null}
          {!sourceMine && destMine ? <Alert tone="info" className="sm:col-span-2">{t("transfers.requestFromOther")}</Alert> : null}
          <Field label={t("common.notes")} htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" maxLength={1000} className="min-h-10" />
          </Field>
        </CardBody>
      </Card>
      <Card className="mt-4">
        <CardBody>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("common.items")}</h2>
          <LineEditor
            key={`${source}:${stockBranch}`}
            branchId={stockBranch}
            availableLabel={sourceMine ? t("transfers.sourceStock") : t("transfers.yourStock")}
            pickerPlaceholder={t("transfers.addProduct")}
            onLinesChange={setN}
          />
        </CardBody>
      </Card>
      <div className="mt-4 flex justify-end">
        <SubmitButton disabled={!n || !allowed}>{t("transfers.submit")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
