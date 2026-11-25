import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-semibold text-slate-300">404</p>
        <h1 className="mt-3 text-lg font-semibold text-slate-800">{t("common.notFound")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("errors.not_found")}</p>
        <Link href="/" className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline">{t("common.goHome")}</Link>
      </div>
    </div>
  );
}
