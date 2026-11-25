import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db";
import { getT } from "@/i18n/server";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { logoutAction } from "@/app/actions";

export const metadata = { title: { default: "Supplier portal", template: "%s · Supplier portal" } };

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor("supplier.portal");
  const { t, locale } = await getT();
  const [supplier, unread] = await Promise.all([
    actor.supplierId ? db.supplier.findUnique({ where: { id: actor.supplierId }, select: { name: true } }) : null,
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/supplier" className="flex min-w-0 items-center gap-2 font-semibold text-brand-800">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
              <svg viewBox="0 0 32 32" className="size-5" aria-hidden><path d="M7 21l5-5 4 4 8-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span className="truncate">{t("supplierPortal.title")}</span>
          </Link>
          <span className="hidden truncate text-sm text-slate-500 sm:inline">· {supplier?.name ?? actor.name}</span>
          <div className="ms-auto flex items-center gap-2">
            <LocaleSwitch locale={locale} />
            <Link href="/supplier/notifications" className="relative grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("nav.notifications")}>
              <Bell className="size-5" />
              {unread ? <span className="tnum absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span> : null}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-rose-600" aria-label={t("common.logout")} title={t("common.logout")}>
                <LogOut className="size-4 flip-rtl" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
