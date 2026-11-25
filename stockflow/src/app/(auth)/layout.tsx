import { getT } from "@/i18n/server";
import { LocaleSwitch } from "@/components/shell/locale-switch";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await getT();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-brand-800 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold"><Logo /> {t("app.name")}</div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">{t("auth.heroTitle")}</h2>
          <p className="mt-4 text-brand-100">{t("auth.heroBody")}</p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {["auth.point1", "auth.point2", "auth.point3"].map((k) => (
              <li key={k} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-300" />{t(k)}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-200">© {new Date().getFullYear()} {t("app.name")}</p>
      </section>
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-brand-800 lg:invisible"><Logo /> {t("app.name")}</div>
          <LocaleSwitch locale={locale} />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </section>
    </main>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.15" />
      <path d="M8 20l5-5 4 4 7-8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="11" r="2" fill="currentColor" />
    </svg>
  );
}
