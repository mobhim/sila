import { orNotFound } from "@/server/page";
import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { can, hasBranchAccess } from "@/server/rbac";
import { getTransfer } from "@/server/transfers";
import { getFmt } from "@/i18n/server";
import { Alert, Card, CardBody, CardHeader, DescList, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/forms";
import { Timeline } from "@/components/ui/nav";
import { TransferBadge, bname, pname } from "@/components/status";
import { num, q3 } from "@/lib/num";
import { approveTransferAction, cancelTransferAction, closeTransferAction } from "../actions";
import { TransferQtyForm } from "./forms";

export const metadata = { title: "Transfer" };

export default async function TransferDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("transfers.view");
  const { id } = await params;
  const { transfer: tr, events, users, sourceStock } = await orNotFound(getTransfer(actor, id));
  const f = await getFmt();
  const { t, locale } = f;
  const userName = (uid: string | null | undefined) => (uid ? users.find((u) => u.id === uid)?.name ?? "—" : "—");

  const manage = can(actor, "transfers.manage");
  const atSource = manage && hasBranchAccess(actor, tr.sourceBranchId);
  const atDest = manage && hasBranchAccess(actor, tr.destinationBranchId);
  const showSourceStock = hasBranchAccess(actor, tr.sourceBranchId);
  const stock = new Map(sourceStock.map((s) => [s.productId, num(s.quantity) - num(s.reserved)]));
  const hidden = { id: tr.id };
  const dispatched = ["DISPATCHED", "PARTIALLY_RECEIVED", "COMPLETED"].includes(tr.status);
  const shortfall = tr.items.some((i) => num(i.dispatchedQty) > num(i.receivedQty));

  const actions = [];
  if (tr.status === "REQUESTED" && atSource)
    actions.push(<ConfirmAction key="approve" action={approveTransferAction} hidden={hidden} label={t("common.approve")} title={t("transfers.act.approveTitle")} description={t("transfers.act.approveDesc")} reason={t("transfers.act.note")} variant="success" size="md" />);
  if (["REQUESTED", "APPROVED"].includes(tr.status) && manage)
    actions.push(<ConfirmAction key="cancel" action={cancelTransferAction} hidden={hidden} label={t("transfers.act.cancel")} title={t("transfers.act.cancelTitle")} description={t("common.cannotUndo")} reason={t("common.reason")} reasonRequired variant="danger" size="md" />);
  if (tr.status === "PARTIALLY_RECEIVED" && atDest)
    actions.push(<ConfirmAction key="close" action={closeTransferAction} hidden={hidden} label={t("transfers.act.close")} title={t("transfers.act.closeTitle")} description={t("transfers.act.closeDesc")} reason={t("common.reason")} reasonRequired variant="secondary" size="md" />);

  return (
    <>
      <PageHeader
        back={{ href: "/transfers", label: t("transfers.title") }}
        title={<span className="flex flex-wrap items-center gap-3"><span dir="ltr">TRF-{tr.seq}</span><TransferBadge status={tr.status} t={t} /></span>}
        description={t("transfers.route", { from: bname(tr.source, locale), to: bname(tr.destination, locale) })}
        actions={actions}
      />
      {tr.status === "APPROVED" && !atSource ? <Alert tone="info" className="mb-4">{t("transfers.waitDispatch")}</Alert> : null}
      {tr.status === "DISPATCHED" && !atDest ? <Alert tone="info" className="mb-4">{t("transfers.waitReceive")}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title={t("common.items")} />
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t("common.product")}</th>
                    {showSourceStock ? <th className="text-end">{t("transfers.sourceStock")}</th> : null}
                    <th className="text-end">{t("transfers.col.requested")}</th>
                    <th className="text-end">{t("transfers.col.dispatched")}</th>
                    <th className="text-end">{t("transfers.col.received")}</th>
                    <th className="text-end">{t("transfers.col.outstanding")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tr.items.map((i) => {
                    const out = dispatched ? Math.max(0, q3(num(i.dispatchedQty) - num(i.receivedQty))) : 0;
                    return (
                      <tr key={i.id}>
                        <td>
                          <p className="font-medium text-slate-800">{pname(i.product, locale)}</p>
                          <p className="text-xs text-slate-500" dir="ltr">{i.product.sku} · {t(`enums.unit.${i.product.baseUnit}`)}</p>
                        </td>
                        {showSourceStock ? <td className={`tnum text-end ${(stock.get(i.productId) ?? 0) < num(i.requestedQty) && !dispatched ? "text-rose-600" : ""}`}>{f.num(stock.get(i.productId) ?? 0)}</td> : null}
                        <td className="tnum text-end font-medium">{f.num(num(i.requestedQty))}</td>
                        <td className="tnum text-end">{dispatched ? f.num(num(i.dispatchedQty)) : "—"}</td>
                        <td className="tnum text-end">{dispatched ? f.num(num(i.receivedQty)) : "—"}</td>
                        <td className={`tnum text-end ${out > 0 ? "font-semibold text-amber-700" : ""}`}>{dispatched ? f.num(out) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {tr.status === "APPROVED" && atSource ? (
            <Card>
              <CardHeader title={t("transfers.dispatchTitle")} description={t("transfers.dispatchDesc")} />
              <CardBody>
                <TransferQtyForm
                  id={tr.id}
                  mode="dispatch"
                  lines={tr.items.map((i) => ({
                    id: i.id, name: pname(i.product, locale), sku: i.product.sku, unit: i.product.baseUnit,
                    info: [
                      { label: t("transfers.sourceStock"), value: stock.get(i.productId) ?? 0 },
                      { label: t("transfers.col.requested"), value: num(i.requestedQty) },
                    ],
                    defaultValue: Math.max(0, Math.min(num(i.requestedQty), stock.get(i.productId) ?? 0)),
                    max: num(i.requestedQty),
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}

          {["DISPATCHED", "PARTIALLY_RECEIVED"].includes(tr.status) && atDest ? (
            <Card>
              <CardHeader title={t("transfers.receiveTitle")} description={t("transfers.receiveDesc")} />
              <CardBody>
                <TransferQtyForm
                  id={tr.id}
                  mode="receive"
                  lines={tr.items
                    .map((i) => ({ i, out: Math.max(0, q3(num(i.dispatchedQty) - num(i.receivedQty))) }))
                    .filter((x) => x.out > 0)
                    .map(({ i, out }) => ({
                      id: i.id, name: pname(i.product, locale), sku: i.product.sku, unit: i.product.baseUnit,
                      info: [
                        { label: t("transfers.col.dispatched"), value: num(i.dispatchedQty) },
                        { label: t("transfers.col.outstanding"), value: out },
                      ],
                      defaultValue: out,
                      max: out,
                    }))}
                />
              </CardBody>
            </Card>
          ) : null}

          {tr.status === "COMPLETED" && shortfall ? <Alert tone="warn">{t("transfers.closedShort")}</Alert> : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DescList
                className="sm:grid-cols-1"
                items={[
                  { label: t("transfers.source"), value: <Link href={`/branches/${tr.source.id}`} className="hover:text-brand-700">{bname(tr.source, locale)} · {tr.source.code}</Link> },
                  { label: t("transfers.destination"), value: <Link href={`/branches/${tr.destination.id}`} className="hover:text-brand-700">{bname(tr.destination, locale)} · {tr.destination.code}</Link> },
                  { label: t("transfers.requestedBy"), value: `${userName(tr.requestedById)} · ${f.dateTime(tr.createdAt)}` },
                  ...(tr.approvedAt ? [{ label: t("transfers.approvedBy"), value: `${userName(tr.approvedById)} · ${f.dateTime(tr.approvedAt)}` }] : []),
                  ...(tr.dispatchedAt ? [{ label: t("transfers.dispatchedBy"), value: `${userName(tr.dispatchedById)} · ${f.dateTime(tr.dispatchedAt)}` }] : []),
                  ...(tr.receivedById ? [{ label: t("transfers.receivedBy"), value: `${userName(tr.receivedById)}${tr.completedAt ? ` · ${f.dateTime(tr.completedAt)}` : ""}` }] : []),
                  ...(tr.cancelReason ? [{ label: t("transfers.cancelReason"), value: tr.cancelReason }] : []),
                  ...(tr.notes ? [{ label: t("common.notes"), value: <span className="whitespace-pre-line">{tr.notes}</span> }] : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("common.history")} />
            <CardBody>
              <Timeline items={events.map((e) => ({ id: e.id, title: t(`enums.transfer.${e.toStatus}`), meta: `${userName(e.userId)} · ${f.dateTime(e.createdAt)}`, note: e.note }))} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
