import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { listForSupplier } from "@/server/replenishment";
import { getFmt } from "@/i18n/server";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { ReplBadge, bname } from "@/components/status";

export const metadata = { title: "Requests" };

export default async function SupplierHome() {
  const actor = await requireActor("supplier.portal");
  const rows = await listForSupplier(actor);
  const f = await getFmt();
  const { t, locale } = f;
  const groups = [
    { key: "new", rows: rows.filter((r) => r.status === "SENT_TO_SUPPLIER") },
    { key: "active", rows: rows.filter((r) => ["ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(r.status)) },
    { key: "done", rows: rows.filter((r) => ["RECEIVED", "CANCELLED"].includes(r.status)) },
  ];

  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{t("supplierPortal.requests")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("supplierPortal.requestsHint")}</p>
      </div>
      <div className="space-y-4">
        {groups.map((g) => (
          <Card key={g.key}>
            <CardHeader title={`${t(`supplierPortal.group.${g.key}`)} (${g.rows.length})`} />
            {g.rows.length ? (
              <ul className="divide-y divide-slate-100">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/supplier/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800"><span dir="ltr">REQ-{r.seq}</span> · {bname(r.branch, locale)}</p>
                        <p className="text-xs text-slate-500">
                          {t("supplierPortal.itemsCount", { n: r.items.length })} · {t("supplierPortal.sentOn", { date: f.date(r.sentAt ?? r.createdAt) })}
                          {r.expectedAt ? ` · ${t("supplierPortal.expected")}: ${f.date(r.expectedAt)}` : ""}
                        </p>
                      </div>
                      <ReplBadge status={r.status} t={t} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t(`supplierPortal.empty.${g.key}`)} />
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
