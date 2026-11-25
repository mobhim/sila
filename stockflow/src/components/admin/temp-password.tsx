"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, KeyRound } from "lucide-react";
import { btnClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** Shows a one-time temporary password with a copy button. */
export function TempPassword({ password, title, link, back }: { password: string; title?: string; link?: { href: string; label: string }; back?: { href: string; label: string } }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><KeyRound className="size-4" /> {title ?? t("users.tempTitle")}</div>
      <p className="mt-1 text-xs text-emerald-800">{t("users.tempHint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-base tracking-wider text-slate-900 select-all" dir="ltr">{password}</code>
        <button type="button" className={btnClass("secondary", "sm")} onClick={async () => { await navigator.clipboard.writeText(password); setCopied(true); }}>
          <Copy className="size-3.5" /> {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      {link || back ? (
        <div className="mt-4 flex gap-2">
          {link ? <Link href={link.href} className={btnClass("primary", "sm")}>{link.label}</Link> : null}
          {back ? <Link href={back.href} className={btnClass("secondary", "sm")}>{back.label}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
