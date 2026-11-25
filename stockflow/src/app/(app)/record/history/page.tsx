import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db";
import { listAdjustments } from "@/server/adjustments";
import { getFmt } from "@/i18n/server";
import { Card, CardHeader, EmptyState, PageHeader, ButtonLink } from "@/components/ui";
import { Pagination, Tabs } from "@/components/ui/nav";
import { ApprovalBadge, TxBadge, pname } from "@/components/status";

export const metadata = { title: "My history" };
const PAGE = 30;

export default async function MyHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor("transactions.viewOwn");
  const sp = await searchParams;
  const f = await getFmt();
  const { t, locale } = f;
  const tab = sp.tab === "reports" ? "reports" : "movements";
  const page = Math.max(1, Number(sp.page) || 1);

  const tabs = (
    <Tabs active={tab} items={[
      { key: "movements", label: t("record.historyMovements"), href: "/record/history" },
      { key: "reports", label: t("record.historyReports"), href: "/record/history?tab=reports" },
    ]} />
  );

  if (tab === "reports") {
    const { rows } = await listAdjustments(actor, { mine: true, page });
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t("nav.myHistory")} actions={<ButtonLink href="/record">{t("nav.record")}</ButtonLink>} />
        {tabs}
        <Card>
          {rows.length ? (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{pname(r.product, locale)}</p>
                    <p className="text-xs text-slate-500">{t(`enums.adjustmentKind.${r.kind}`)} · <span className="tnum">{f.num(Number(r.quantity))}</span> {t(`enums.unit.${r.product.baseUnit}`)} · {f.dateTime(r.createdAt)}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{r.reason}</p>
                    {r.reviewNote && r.status !== "PENDING" ? <p className="mt-0.5 text-xs text-slate-500">{r.reviewedBy?.name}: {r.reviewNote}</p> : null}
                  </div>
                  <ApprovalBadge status={r.status} t={t} />
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t("record.noReports")} />}
        </Card>
      </div>
    );
  }

  const where = { userId: actor.id };
  const [rows, total] = await Promise.all([
    db.inventoryTransaction.findMany({
      where,
      include: { product: { select: { name: true, nameAr: true, baseUnit: true } }, branch: { select: { code: true } } },
      orderBy: { seq: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    db.inventoryTransaction.count({ where }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("nav.myHistory")} description={t("record.historyHint")} actions={<ButtonLink href="/record">{t("nav.record")}</ButtonLink>} />
      {tabs}
      <Card>
        <CardHeader title={t("common.results", { n: f.num(total) })} />
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{pname(r.product, locale)}</p>
                  <p className="text-xs text-slate-500"><span dir="ltr" className="font-mono">TX-{r.seq}</span> · {r.branch.code} · {f.dateTime(r.createdAt)}</p>
                  {r.reason ? <p className="text-xs text-slate-500">{r.reason}</p> : null}
                </div>
                <div className="shrink-0 text-end">
                  <TxBadge type={r.type} t={t} />
                  <p className={`tnum mt-1 text-sm font-semibold ${Number(r.quantity) < 0 ? "text-rose-600" : "text-emerald-600"}`} dir="ltr">
                    {Number(r.quantity) > 0 ? "+" : ""}{f.num(Number(r.quantity))} <span className="text-xs font-normal text-slate-500">{t(`enums.unit.${r.product.baseUnit}`)}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("record.noHistory")} action={<Link href="/record" className="text-sm font-medium text-brand-700">{t("nav.record")}</Link>} />
        )}
        <Pagination path="/record/history" params={sp} page={page} pageSize={PAGE} total={total}
          labels={{ prev: t("common.prev"), next: t("common.next"), summary: t("common.page", { page, pages: Math.max(1, Math.ceil(total / PAGE)) }) }} />
      </Card>
    </div>
  );
}
