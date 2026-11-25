import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { can, hasBranchAccess } from "@/server/rbac";
import { db } from "@/server/db";
import { getProduct } from "@/server/products";
import { branchOptions } from "@/server/branches";
import { recentProductTransactions } from "@/server/ledger-queries";
import { getSettings } from "@/server/settings";
import { AppError } from "@/server/errors";
import { available, daysRemaining, stockState } from "@/server/inventory/calc";
import { getFmt } from "@/i18n/server";
import { Badge, ButtonLink, Card, CardBody, CardHeader, DescList, EmptyState, PageHeader } from "@/components/ui";
import { StockBadge, bname, pname } from "@/components/status";
import { TxTable } from "@/components/inventory/tx-table";
import { ThresholdForm } from "@/components/inventory/threshold-form";
import { updateThresholdsAction } from "../actions";

export const metadata = { title: "Product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("products.view");
  const { id } = await params;
  const f = await getFmt();
  const { t, locale } = f;
  const p = await getProduct(actor, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const settings = await getSettings();
  const canThresholds = can(actor, "inventory.thresholds");
  const [txs, options, pendingAlerts] = await Promise.all([
    can(actor, "transactions.view") ? recentProductTransactions(actor, id, 20) : Promise.resolve(null),
    canThresholds ? branchOptions(actor) : Promise.resolve([]),
    db.stockAlert.findMany({
      where: { productId: id, status: "REPLENISHMENT_PENDING", branchId: { in: p.inventory.map((i) => i.branchId) } },
      select: { branchId: true },
    }),
  ]);
  const pending = new Set(pendingAlerts.map((a) => a.branchId));
  const unstocked = options.filter((b) => !p.inventory.some((i) => i.branchId === b.id));
  const unitLabel = t(`enums.unit.${p.baseUnit}`);
  const totalQty = p.inventory.reduce((s, i) => s + Number(i.quantity), 0);

  return (
    <>
      <PageHeader
        title={pname(p, locale)}
        description={<span dir="ltr" className="font-mono">{p.sku}</span>}
        back={{ href: "/products", label: t("products.title") }}
        actions={
          <>
            <Badge tone={p.status === "ACTIVE" ? "green" : "gray"}>{t(`enums.recordStatus.${p.status}`)}</Badge>
            {can(actor, "products.manage") ? <ButtonLink href={`/products/${id}/edit`} variant="secondary">{t("products.edit")}</ButtonLink> : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("products.basicInfo")} />
          <CardBody className="space-y-4">
            {p.imageId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${p.imageId}`} alt={pname(p, locale)} className="h-40 w-full rounded-lg border border-slate-200 object-contain" />
            ) : null}
            <DescList
              className="sm:grid-cols-2"
              items={[
                { label: t("common.name"), value: p.name },
                { label: t("common.nameAr"), value: p.nameAr ?? "—" },
                { label: t("common.barcode"), value: <span dir="ltr" className="font-mono">{p.barcode ?? "—"}</span> },
                { label: t("common.category"), value: p.category ? pname(p.category, locale) : t("products.noCategory") },
                { label: t("products.defaultSupplier"), value: p.supplier ? (can(actor, "suppliers.view") ? <Link className="text-brand-700 hover:underline" href={`/suppliers/${p.supplier.id}`}>{p.supplier.name}</Link> : p.supplier.name) : t("products.noSupplier") },
                { label: t("products.baseUnit"), value: unitLabel },
                { label: t("products.costPrice"), value: f.money(Number(p.costPrice)) },
                { label: t("products.sellingPrice"), value: p.sellingPrice === null ? "—" : f.money(Number(p.sellingPrice)) },
                { label: t("products.totalStock"), value: `${f.num(totalQty)} ${unitLabel}` },
              ]}
            />
            {p.description ? <p className="whitespace-pre-line text-sm text-slate-600">{p.description}</p> : null}
            {p.units.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500">{t("products.units")}</p>
                <ul className="space-y-1.5">
                  {p.units.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span>{t("products.conversion", { unit: t(`enums.unit.${u.unit}`), factor: f.num(Number(u.factor)), base: unitLabel })}</span>
                      <span className="flex items-center gap-2">
                        {u.barcode ? <span className="font-mono text-xs text-slate-500" dir="ltr">{u.barcode}</span> : null}
                        {u.isOrderUnit ? <Badge tone="teal" dot={false}>{t("products.orderUnit")}</Badge> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("products.stockByBranch")} description={t("products.stockByBranchHint")} />
          {p.inventory.length ? (
            <ul className="divide-y divide-slate-100">
              {p.inventory.map((inv) => {
                const avail = available(Number(inv.quantity), Number(inv.reserved));
                const adc = Number(inv.avgDailyConsumption);
                const state = stockState(avail, Number(inv.minStock), inv.criticalStock === null ? null : Number(inv.criticalStock), settings.criticalPercent);
                const days = daysRemaining(avail, adc);
                const editable = canThresholds && hasBranchAccess(actor, inv.branchId);
                return (
                  <li key={inv.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{bname(inv.branch, locale)} <span className="text-xs text-slate-400">{inv.branch.code}</span></p>
                        <p className="text-xs text-slate-500">{t("products.lastMovement")}: {f.dateTime(inv.lastMovementAt)}</p>
                      </div>
                      <StockBadge state={state} t={t} pending={pending.has(inv.branchId)} />
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-sm sm:grid-cols-6">
                      {[
                        [t("products.available"), `${f.num(avail)}`],
                        [t("products.minStock"), f.num(Number(inv.minStock))],
                        [t("products.maxStock"), Number(inv.maxStock) ? f.num(Number(inv.maxStock)) : "—"],
                        [t("products.reorderQty"), f.num(Number(inv.reorderQty))],
                        [t("products.adc"), adc ? f.num(adc, 2) : "—"],
                        [t("products.daysLeft"), days === null ? "—" : f.num(days, 1)],
                      ].map(([k, v]) => (
                        <div key={k} className="rounded-md bg-slate-50 px-2 py-1.5">
                          <dt className="text-[11px] text-slate-500">{k}</dt>
                          <dd className="tnum font-semibold text-slate-800">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {editable ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-brand-700 hover:underline">{t("products.thresholds")}</summary>
                        <div className="mt-3 rounded-lg border border-slate-200 p-3">
                          <ThresholdForm
                            action={updateThresholdsAction}
                            productId={id}
                            branchId={inv.branchId}
                            values={{
                              minStock: Number(inv.minStock),
                              criticalStock: inv.criticalStock === null ? null : Number(inv.criticalStock),
                              reorderQty: Number(inv.reorderQty),
                              maxStock: Number(inv.maxStock),
                              safetyStock: Number(inv.safetyStock),
                            }}
                          />
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title={t("products.notStocked")} />
          )}
          {unstocked.length ? (
            <CardBody className="border-t border-slate-100">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">{t("products.addToBranch")}</summary>
                <p className="mt-1 text-xs text-slate-500">{t("products.addToBranchHint")}</p>
                <div className="mt-3">
                  <ThresholdForm action={updateThresholdsAction} productId={id} branches={unstocked.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))} />
                </div>
              </details>
            </CardBody>
          ) : null}
        </Card>
      </div>

      {txs ? (
        <Card className="mt-4">
          <CardHeader title={t("products.recentTx")} actions={<Link href={`/transactions?productId=${id}`} className="text-xs font-medium text-brand-700 hover:underline">{t("products.viewLedger")}</Link>} />
          {txs.length ? <TxTable rows={txs} f={f} showProduct={false} /> : <EmptyState title={t("products.noTx")} />}
        </Card>
      ) : null}
    </>
  );
}
