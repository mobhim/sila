import Link from "next/link";
import type { AlertLevel } from "@prisma/client";
import { requireActor } from "@/server/auth/current";
import { can, hasBranchAccess } from "@/server/rbac";
import { getSelectedBranch } from "@/server/branch-selection";
import { branchOptions } from "@/server/branches";
import { listAlerts } from "@/server/alerts";
import { db } from "@/server/db";
import { getFmt } from "@/i18n/server";
import { Button, Card, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/forms";
import { Pagination, Tabs, withParams } from "@/components/ui/nav";
import { AlertStatusBadge, StockBadge, bname, pname } from "@/components/status";
import { ProductFilter } from "@/components/inventory/product-filter";
import { acknowledgeAlertAction, createRequestFromAlertAction } from "./actions";

export const metadata = { title: "Stock alerts" };

type SP = Record<string, string | undefined>;
const LEVELS: AlertLevel[] = ["LOW", "CRITICAL", "OUT_OF_STOCK"];

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor("alerts.view");
  const sp = await searchParams;
  const f = await getFmt();
  const { t, locale } = f;
  const selected = await getSelectedBranch(actor);
  const branchId = sp.branch === "all" ? undefined : sp.branch && hasBranchAccess(actor, sp.branch) ? sp.branch : selected ?? undefined;
  const statusKey = sp.status === "RESOLVED" || sp.status === "ALL" ? sp.status : "ACTIVE";
  const level = LEVELS.includes(sp.level as AlertLevel) ? (sp.level as AlertLevel) : undefined;

  const [data, branches, product] = await Promise.all([
    listAlerts(actor, {
      branchId,
      productId: sp.productId || undefined,
      level,
      // "ALL" = every status: the service treats undefined as active, so pass each explicitly below.
      status: statusKey === "RESOLVED" ? "RESOLVED" : "ACTIVE",
      page: Number(sp.page) || 1,
    }),
    branchOptions(actor),
    sp.productId ? db.product.findUnique({ where: { id: sp.productId }, select: { name: true, nameAr: true, sku: true } }) : Promise.resolve(null),
  ]);
  // For "ALL", merge resolved alerts after the active ones on the same page.
  const resolved =
    statusKey === "ALL"
      ? await listAlerts(actor, { branchId, productId: sp.productId || undefined, level, status: "RESOLVED", page: Number(sp.page) || 1 })
      : null;
  const rows = resolved ? [...data.rows, ...resolved.rows] : data.rows;
  const total = resolved ? Math.max(data.total, resolved.total) : data.total;
  const pages = Math.max(1, Math.ceil(total / data.pageSize));
  const canManage = can(actor, "alerts.manage");
  const canRequest = can(actor, "replenishment.manage");

  return (
    <>
      <PageHeader title={t("alerts.title")} description={t("alerts.subtitle")} />
      <Tabs
        active={statusKey}
        items={(["ACTIVE", "RESOLVED", "ALL"] as const).map((s) => ({ key: s, label: t(`alerts.status.${s}`), href: withParams("/alerts", sp, { status: s === "ACTIVE" ? null : s, page: null }) }))}
      />
      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-3 lg:grid-cols-[1.5fr_2fr]">
          <Field label={t("common.product")}>
            <ProductFilter branchId={branchId ?? branches[0]?.id ?? null} selectedLabel={product ? `${pname(product, locale)} · ${product.sku}` : null} />
          </Field>
          <form method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {sp.productId ? <input type="hidden" name="productId" value={sp.productId} /> : null}
            {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
            <Field label={t("common.branch")}>
              <Select name="branch" defaultValue={branchId ?? "all"}>
                {actor.role === "OWNER" || branches.length > 1 ? <option value="all">{t("common.allBranches")}</option> : null}
                {branches.map((b) => <option key={b.id} value={b.id}>{bname(b, locale)}</option>)}
              </Select>
            </Field>
            <Field label={t("alerts.col.level")}>
              <Select name="level" defaultValue={level ?? ""}>
                <option value="">{t("alerts.allLevels")}</option>
                {LEVELS.map((l) => <option key={l} value={l}>{t(`enums.alertLevel.${l}`)}</option>)}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">{t("common.filter")}</Button>
          </form>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t("alerts.col.product")}</th>
                  <th>{t("alerts.col.branch")}</th>
                  <th>{t("alerts.col.level")}</th>
                  <th>{t("alerts.col.status")}</th>
                  <th className="text-end">{t("alerts.col.current")}</th>
                  <th className="text-end">{t("alerts.col.min")}</th>
                  <th className="text-end">{t("alerts.col.recommended")}</th>
                  <th>{t("alerts.col.triggered")}</th>
                  <th>{t("alerts.col.request")}</th>
                  <th><span className="sr-only">{t("common.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const unit = t(`enums.unit.${a.product.baseUnit}`);
                  return (
                    <tr key={a.id}>
                      <td className="min-w-44">
                        <Link href={`/products/${a.product.id}`} className="font-medium text-slate-800 hover:text-brand-700">{pname(a.product, locale)}</Link>
                        <span className="block font-mono text-xs text-slate-400" dir="ltr">{a.product.sku}</span>
                      </td>
                      <td className="whitespace-nowrap text-xs">{bname(a.branch, locale)} <span className="text-slate-400">{a.branch.code}</span></td>
                      <td><StockBadge state={a.level} t={t} /></td>
                      <td><AlertStatusBadge status={a.status} t={t} /></td>
                      <td className="tnum whitespace-nowrap text-end font-semibold">{f.num(Number(a.currentQuantity))} <span className="text-xs font-normal text-slate-500">{unit}</span></td>
                      <td className="tnum text-end text-slate-600">{f.num(Number(a.minStockAtTrigger))}</td>
                      <td className="tnum text-end text-slate-600">{Number(a.recommendedQty) ? f.num(Number(a.recommendedQty)) : "—"}</td>
                      <td className="whitespace-nowrap text-xs text-slate-600">
                        {f.dateTime(a.triggeredAt)}
                        {a.resolvedAt ? <span className="block text-emerald-700">{t("alerts.resolvedAt", { date: f.dateTime(a.resolvedAt) })}</span> : null}
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {a.replenishment ? (
                          <Link href={`/replenishment/${a.replenishment.id}`} className="text-brand-700 hover:underline">{t("alerts.openRequest", { no: a.replenishment.seq })} · {t(`enums.replenishment.${a.replenishment.status}`)}</Link>
                        ) : "—"}
                      </td>
                      <td>
                        {a.status !== "RESOLVED" ? (
                          <div className="flex justify-end gap-1.5">
                            {canManage && a.status === "OPEN" ? (
                              <ConfirmAction action={acknowledgeAlertAction} hidden={{ id: a.id }} label={t("alerts.acknowledge")} title={t("alerts.ackTitle")} description={t("alerts.ackHint")} variant="ghost" />
                            ) : null}
                            {canRequest && !a.replenishment ? (
                              <ConfirmAction
                                action={createRequestFromAlertAction}
                                hidden={{ id: a.id }}
                                label={t("alerts.createRequest")}
                                title={t("alerts.createTitle")}
                                description={t("alerts.createHint", { qty: `${f.num(Number(a.recommendedQty))} ${unit}` })}
                                variant="primary"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title={t("alerts.empty")} description={t("alerts.emptyHint")} />
        )}
        <Pagination
          path="/alerts"
          params={sp}
          page={data.page}
          pageSize={data.pageSize}
          total={total}
          labels={{ prev: t("common.prev"), next: t("common.next"), summary: `${t("common.results", { n: f.num(resolved ? data.total + resolved.total : data.total) })} · ${t("common.page", { page: data.page, pages })}` }}
        />
      </Card>
    </>
  );
}
