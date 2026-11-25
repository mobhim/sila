import { redirect } from "next/navigation";
import { getActor, homeFor } from "@/server/auth/current";
import { getT } from "@/i18n/server";
import { LoginForm } from "./form";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  if (actor) redirect(homeFor(actor));
  const { t } = await getT();
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-900">{t("auth.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("auth.subtitle")}</p>
      <LoginForm next={next ?? ""} />
    </>
  );
}
