import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/current";
import { getT } from "@/i18n/server";
import { ChangePasswordForm } from "./form";

export default async function ChangePasswordPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const { t } = await getT();
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">{t("auth.changeTitle")}</h1>
      <p className="mt-1 text-sm text-slate-500">{actor.mustChangePassword ? t("auth.mustChange") : t("auth.changeSubtitle")}</p>
      <ChangePasswordForm />
    </>
  );
}
