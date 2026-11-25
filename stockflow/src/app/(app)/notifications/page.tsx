import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listMyNotifications } from "@/server/admin-queries";
import { getFmt } from "@/i18n/server";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { Pagination, Tabs } from "@/components/ui/nav";
import { DeliveryBadge } from "@/components/status";
import { cn } from "@/lib/cn";
import { MarkRead } from "./buttons";

export const metadata = { title: "Notifications" };

const DOT: Record<string, string> = { critical: "bg-rose-500", warning: "bg-amber-500", success: "bg-emerald-500", info: "bg-sky-500" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const f = await getFmt();
  const { t } = f;
  const sp = await searchParams;
  const unreadOnly = sp.filter === "unread";
  const data = await listMyNotifications(actor, { unread: unreadOnly, page: Number(sp.page) || 1 });

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} actions={data.unread ? <MarkRead all /> : null} />
      <Tabs active={unreadOnly ? "unread" : "all"} items={[
        { key: "all", label: t("notifications.all"), href: "/notifications" },
        { key: "unread", label: t("notifications.unread"), href: "/notifications?filter=unread", count: data.unread },
      ]} />
      <Card>
        {data.rows.length ? (
          <>
            <ul className="divide-y divide-slate-100">
              {data.rows.map((n) => (
                <li key={n.id} className={cn("flex gap-3 px-4 py-3 sm:px-5", !n.readAt && "bg-brand-50/40")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-slate-200" : DOT[n.severity] ?? DOT.info)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className={cn("text-sm", n.readAt ? "text-slate-700" : "font-semibold text-slate-900")}>
                        {n.link ? <Link href={n.link} className="hover:text-brand-700">{n.title}</Link> : n.title}
                      </p>
                      <span className="whitespace-nowrap text-xs text-slate-400">{f.dateTime(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {n.deliveries.map((d) => (
                        <span key={d.id} className="inline-flex items-center gap-1 text-xs text-slate-500" title={d.lastError ?? undefined}>
                          {t(`enums.channel.${d.channel}`)}: <DeliveryBadge status={d.status} t={t} />
                        </span>
                      ))}
                      {n.link ? <Link href={n.link} className="text-xs font-medium text-brand-700 hover:underline">{t("notifications.open")}</Link> : null}
                      {!n.readAt ? <MarkRead id={n.id} /> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination path="/notifications" params={sp} page={data.page} pageSize={data.pageSize} total={data.total}
              labels={{ prev: t("common.prev"), next: t("common.next"), summary: t("common.page", { page: data.page, pages: Math.max(1, Math.ceil(data.total / data.pageSize)) }) }} />
          </>
        ) : <EmptyState title={t("notifications.empty")} description={t("notifications.emptyHint")} />}
      </Card>
    </>
  );
}
