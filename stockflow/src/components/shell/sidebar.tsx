"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ICONS } from "./icons";
import type { IconName } from "./nav-config";

export interface SidebarGroup {
  label: string;
  items: { href: string; label: string; icon: IconName; badge?: number }[];
}

function isActive(path: string, href: string) {
  if (href === "/record") return path === "/record";
  return path === href || path.startsWith(href + "/");
}

function NavList({ groups, onNavigate }: { groups: SidebarGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon];
              const active = isActive(path, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-brand-600" : "text-slate-400")} aria-hidden />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge ? <span className="tnum rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700">{it.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ groups, brand, footer }: { groups: SidebarGroup[]; brand: React.ReactNode; footer: React.ReactNode }) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-slate-200 bg-white lg:flex">
      <div className="flex h-14 items-center border-b border-slate-100 px-5">{brand}</div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavList groups={groups} />
      </div>
      <div className="border-t border-slate-100 p-3">{footer}</div>
    </aside>
  );
}

export function MobileNav({ groups, brand, footer, label }: { groups: SidebarGroup[]; brand: React.ReactNode; footer: React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" className="no-print -ms-1.5 grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label={label}>
        <Menu className="size-5" />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="close">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-slate-100 p-3">{footer}</div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
