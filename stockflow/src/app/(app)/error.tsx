"use client";
import { useEffect } from "react";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-base font-semibold text-slate-900">{t("common.somethingWrong")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("errors.unexpected")}</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-slate-400" dir="ltr">ref: {error.digest}</p> : null}
      <Button className="mt-4" onClick={reset}>{t("common.tryAgain")}</Button>
    </div>
  );
}
