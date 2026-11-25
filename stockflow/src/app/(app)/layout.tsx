import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, LogOut, UserRound } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can, branchWhere } from "@/server/rbac";
import { db } from "@/server/db";
import { branchOptions } from "@/server/branches";
import { getSelectedBranch } from "@/server/branch-selection";
import { getT } from "@/i18n/server";
import { NAV } from "@/components/shell/nav-config";
import { MobileNav, Sidebar, type SidebarGroup } from "@/components/shell/sidebar";
import { BranchSwitcher } from "@/components/shell/branch-switcher";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { logoutAction } from "@/app/actions";
import { bname } from "@/components/status";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (actor.role === "SUPPLIER") redirect("/supplier");
  const { t, locale } = await getT();

  const [unread, openAlerts, approvals, adjustments, branches, selected] = await Promise.all([
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
    can(actor, "alerts.view") ? db.stockAlert.count({ where: { ...branchWhere(actor), status: { in: ["OPEN", "ACKNOWLEDGED"] } } }) : 0,
    can(actor, "replenishment.approve") ? db.replenishmentRequest.count({ where: { ...branchWhere(actor), status: { in: ["DRAFT", "PENDING_APPROVAL"] } } }) : 0,
    can(actor, "adjustments.approve") ? db.stockAdjustmentRequest.count({ where: { ...branchWhere(actor), status: "PENDING" } }) : 0,
    branchOptions(actor),
    getSelectedBranch(actor),
  ]);
  const badges = { alerts: openAlerts, approvals, adjustments };

  const groups: SidebarGroup[] = NAV.map((g) => ({
    label: t(g.group),
    items: g.items
      .filter((i) => can(actor, i.perm) && !(i.hideIf && can(actor, i.hideIf)))
      .map((i) => ({ href: i.href, label: t(i.label), icon: i.icon, badge: i.badge ? badges[i.badge] : undefined })),
  })).filter((g) => g.items.length);

  const brand = (
    <Link href="/" className="flex items-center gap-2 font-semibold text-brand-800">
      <span className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden><path d="M7 21l5-5 4 4 8-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      {t("app.name")}
    </Link>
  );

  const footer = (
    <div className="flex items-center gap-2">
      <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"><UserRound className="size-4" /></span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">{actor.name}</span>
          <span className="block truncate text-xs text-slate-500">{t(`enums.role.${actor.role}`)}</span>
        </span>
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-rose-600" title={t("common.logout")} aria-label={t("common.logout")}>
          <LogOut className="size-4 flip-rtl" />
        </button>
      </form>
    </div>
  );

  const showSwitcher = actor.role !== "EMPLOYEE" && branches.length > 0;
  const branchLabel = (b: { code: string; name: string; nameAr: string | null }) => `${bname(b, locale)} · ${b.code}`;

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={groups} brand={brand} footer={footer} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <MobileNav groups={groups} brand={brand} footer={footer} label={t("nav.menu")} />
          <div className="lg:hidden">{brand}</div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
            {showSwitcher ? (
              <BranchSwitcher
                branches={branches.map((b) => ({ id: b.id, label: branchLabel(b) }))}
                value={selected ?? "all"}
                allLabel={actor.role === "OWNER" || branches.length > 1 ? t("common.allBranches") : null}
                label={t("common.selectBranch")}
              />
            ) : actor.role === "EMPLOYEE" && branches[0] ? (
              <span className="truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600">{branchLabel(branches[0])}</span>
            ) : null}
            <LocaleSwitch locale={locale} className="hidden sm:block" />
            <Link href="/notifications" className="relative grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("nav.notifications")}>
              <Bell className="size-5" />
              {unread ? <span className="tnum absolute -end-0.5 -top-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span> : null}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
