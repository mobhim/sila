import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { myNotifications } from "@/server/procurement-queries";
import { getFmt } from "@/i18n/server";
import { Card, CardHeader, EmptyState, btnClass } from "@/components/ui";
import { markReadAction } from "../actions";

export const metadata = { title: "Notifications" };

export default async function SupplierNotifications() {
  const actor = await requireActor("supplier.portal");
  const items = await myNotifications(actor);
  const f = await getFmt();
  const { t } = f;
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <Card>
      <CardHeader
        title={t("nav.notifications")}
        actions={unread ? (
          <form action={markReadAction}>
            <button type="submit" className={btnClass("secondary", "sm")}>{t("supplierPortal.markAllRead")}</button>
          </form>
        ) : null}
      />
      {items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 sm:px-5 ${n.readAt ? "" : "bg-brand-50/40"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{n.link?.startsWith("/supplier/") ? <Link href={n.link} className="hover:text-brand-700">{n.title}</Link> : n.title}</p>
                <p className="text-sm text-slate-600">{n.body}</p>
                <p className="mt-0.5 text-xs text-slate-400">{f.dateTime(n.createdAt)}</p>
              </div>
              {!n.readAt ? (
                <form action={markReadAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="text-xs font-medium text-brand-700 hover:underline">{t("supplierPortal.markRead")}</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t("supplierPortal.noNotifications")} />
      )}
    </Card>
  );
}
