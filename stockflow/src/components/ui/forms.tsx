"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Alert, btnClass } from "./index";
import { useI18n } from "@/i18n/client";
import type { ActionResult } from "@/server/action";

export type FormAction<T = unknown> = (prev: ActionResult<T> | null, fd: FormData) => Promise<ActionResult<T>>;

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel, disabled, name, value }: {
  children: React.ReactNode; variant?: "primary" | "secondary" | "danger" | "success" | "ghost"; size?: "sm" | "md" | "lg"; className?: string; pendingLabel?: string; disabled?: boolean; name?: string; value?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} aria-busy={pending} className={btnClass(variant, size, className)}>
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingLabel ?? t("common.saving")}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** A random key per form instance; regenerated after a successful submit. */
export function useIdempotencyKey() {
  const [k, setK] = useState("");
  useEffect(() => setK(crypto.randomUUID()), []);
  return [k, () => setK(crypto.randomUUID())] as const;
}

/**
 * Form bound to a server action with inline error/success messages.
 * - `redirectTo`: navigate on success (string or function of returned data)
 * - `resetOnSuccess`: clear inputs
 * - `idempotent`: include a fresh `idempotencyKey` hidden field
 */
export function ActionForm<T>({
  action, children, className, redirectTo, resetOnSuccess, idempotent, onSuccess, showSuccess = true, id,
}: {
  action: FormAction<T>;
  children: React.ReactNode | ((state: ActionResult<T> | null) => React.ReactNode);
  className?: string;
  redirectTo?: string | ((data: T | undefined) => string);
  resetOnSuccess?: boolean;
  idempotent?: boolean;
  onSuccess?: (data: T | undefined) => void;
  showSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [key, renew] = useIdempotencyKey();
  const { t } = useI18n();

  useEffect(() => {
    if (!state?.ok) return;
    if (idempotent) renew();
    if (resetOnSuccess) ref.current?.reset();
    onSuccess?.(state.data);
    if (redirectTo) router.push(typeof redirectTo === "function" ? redirectTo(state.data) : redirectTo);
    else router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={ref} action={formAction} className={className} id={id} noValidate={false}>
      {idempotent ? <input type="hidden" name="idempotencyKey" value={key} /> : null}
      {state && !state.ok ? <Alert tone="error" className="mb-3">{state.error}</Alert> : null}
      {state?.ok && showSuccess && !redirectTo ? <Alert tone="success" className="mb-3">{state.message ?? t("common.saved")}</Alert> : null}
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}

export function fieldError(state: ActionResult | null, name: string) {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}

/**
 * A button that opens a confirmation dialog and submits a server action, optionally
 * asking for a reason/note (sent as `reason`).
 */
export function ConfirmAction({
  action, label, title, description, confirmLabel, variant = "secondary", size = "sm", fields, reason, reasonRequired, idempotent, hidden,
}: {
  action: FormAction;
  label: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  size?: "sm" | "md" | "lg";
  fields?: React.ReactNode;
  reason?: string;
  reasonRequired?: boolean;
  idempotent?: boolean;
  hidden?: Record<string, string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  return (
    <>
      <button type="button" className={btnClass(variant, size)} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className="m-auto w-[min(92vw,28rem)] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40">
        <ActionForm action={action} idempotent={idempotent} onSuccess={() => dialog.current?.close()} showSuccess={false} className="p-5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          {hidden ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
          <div className="mt-4 space-y-3">
            {fields}
            {reason !== undefined ? (
              <div>
                <label className="label" htmlFor="confirm-reason">{reason}</label>
                <textarea id="confirm-reason" name="reason" required={reasonRequired} maxLength={500} className="input min-h-20" />
              </div>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={btnClass("secondary")} onClick={() => dialog.current?.close()}>{t("common.cancel")}</button>
            <SubmitButton variant={variant === "danger" ? "danger" : variant === "success" ? "success" : "primary"} pendingLabel={t("common.saving")}>
              {confirmLabel ?? t("common.confirm")}
            </SubmitButton>
          </div>
        </ActionForm>
      </dialog>
    </>
  );
}

/** Auto-submit a GET filter form when a select changes. */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input pe-8 ${props.className ?? ""}`} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
