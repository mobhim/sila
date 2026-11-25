import { setLocaleAction } from "@/app/actions";
import type { Locale } from "@/i18n";

export function LocaleSwitch({ locale, className }: { locale: Locale; className?: string }) {
  const other = locale === "ar" ? "en" : "ar";
  return (
    <form action={setLocaleAction} className={className}>
      <input type="hidden" name="locale" value={other} />
      <button type="submit" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50" lang={other}>
        {other === "en" ? "English" : "العربية"}
      </button>
    </form>
  );
}
