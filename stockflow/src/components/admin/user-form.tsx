"use client";
import { useState } from "react";
import { ActionForm, SubmitButton, fieldError, type FormAction } from "@/components/ui/forms";
import { Checkbox, Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { TempPassword } from "./temp-password";

type Role = "OWNER" | "MANAGER" | "EMPLOYEE" | "SUPPLIER";

export interface UserDefaults {
  id?: string;
  name?: string;
  email?: string;
  phone?: string | null;
  role?: Role;
  status?: "ACTIVE" | "INACTIVE";
  locale?: string;
  supplierId?: string | null;
  branchIds?: string[];
  primaryBranchId?: string | null;
}

interface Props<T> {
  action: FormAction<T>;
  defaults?: UserDefaults;
  roles: Role[];
  branches: { id: string; label: string }[];
  suppliers: { id: string; name: string }[];
  isSelf?: boolean;
  created?: boolean;
}

export function UserForm<T>({ action, defaults = {}, roles, branches, suppliers, isSelf, created }: Props<T>) {
  const { t } = useI18n();
  const [role, setRole] = useState<Role>(defaults.role ?? roles[0]);
  const [selected, setSelected] = useState<string[]>(defaults.branchIds ?? []);
  const [primary, setPrimary] = useState<string>(defaults.primaryBranchId ?? defaults.branchIds?.[0] ?? "");

  return (
    <ActionForm action={action} showSuccess={!created}>
      {(state) => {
        const data = state?.ok ? (state.data as { id: string; temporaryPassword: string } | undefined) : undefined;
        if (created && data?.temporaryPassword) {
          return <TempPassword password={data.temporaryPassword} title={t("users.created")} link={{ href: `/employees/${data.id}`, label: t("common.view") }} back={{ href: "/employees", label: t("users.goToList") }} />;
        }
        return (
          <div className="space-y-4">
            {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("common.name")} htmlFor="name" required error={fieldError(state, "name")}>
                <Input id="name" name="name" defaultValue={defaults.name} required maxLength={120} />
              </Field>
              <Field label={t("common.email")} htmlFor="email" required error={fieldError(state, "email")}>
                <Input id="email" name="email" type="email" defaultValue={defaults.email} required maxLength={200} dir="ltr" />
              </Field>
              <Field label={t("common.phone")} htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone ?? ""} maxLength={30} dir="ltr" placeholder="+9665…" />
              </Field>
              <Field label={t("users.locale")} htmlFor="locale">
                <Select id="locale" name="locale" defaultValue={defaults.locale ?? "ar"}>
                  <option value="ar">{t("common.arabic")}</option>
                  <option value="en">{t("common.english")}</option>
                </Select>
              </Field>
              <Field label={t("common.role")} htmlFor="role" hint={t(`users.roleHint.${role}`)}>
                {isSelf ? <input type="hidden" name="role" value={role} /> : null}
                <Select id="role" name={isSelf ? undefined : "role"} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
                  {roles.map((r) => <option key={r} value={r}>{t(`enums.role.${r}`)}</option>)}
                </Select>
              </Field>
              {role === "SUPPLIER" ? (
                <Field label={t("users.supplier")} htmlFor="supplierId" required>
                  <Select id="supplierId" name="supplierId" defaultValue={defaults.supplierId ?? ""} required>
                    <option value="">{t("common.select")}</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              ) : null}
            </div>

            {role === "EMPLOYEE" ? (
              <Field label={t("common.branch")} htmlFor="primaryBranchId" required hint={t("users.branchesHint")}>
                <Select id="primaryBranchId" name="primaryBranchId" value={primary} onChange={(e) => setPrimary(e.target.value)} required>
                  <option value="">{t("common.select")}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </Select>
              </Field>
            ) : role === "MANAGER" ? (
              <fieldset className="space-y-3">
                <legend className="label">{t("users.branches")}</legend>
                <p className="-mt-1 text-xs text-slate-500">{t("users.branchesHint")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((b) => (
                    <Checkbox key={b.id} name="branchIds[]" value={b.id} label={b.label} checked={selected.includes(b.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))} />
                  ))}
                </div>
                {selected.length > 1 ? (
                  <Field label={t("users.primaryBranch")} htmlFor="primaryBranchId">
                    <Select id="primaryBranchId" name="primaryBranchId" value={primary} onChange={(e) => setPrimary(e.target.value)}>
                      {branches.filter((b) => selected.includes(b.id)).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                    </Select>
                  </Field>
                ) : null}
              </fieldset>
            ) : null}

            {isSelf ? <input type="hidden" name="active" value="true" /> : (
              <>
                <input type="hidden" name="active" value="false" />
                <Checkbox name="active" value="true" defaultChecked={(defaults.status ?? "ACTIVE") === "ACTIVE"} label={t("common.active")} />
              </>
            )}
            <div className="flex justify-end">
              <SubmitButton>{defaults.id ? t("common.save") : t("common.create")}</SubmitButton>
            </div>
          </div>
        );
      }}
    </ActionForm>
  );
}
