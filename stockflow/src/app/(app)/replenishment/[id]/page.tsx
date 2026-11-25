import { orNotFound } from "@/server/page";
import Link from "next/link";
import { Printer } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { EDITABLE, RECEIVABLE, getRequest } from "@/server/replenishment";
import { stockFor, supplierOptions, supplierPortalUserCount } from "@/server/procurement-queries";
import { getFmt } from "@/i18n/server";
import { Alert, Card, CardBody, CardHeader, DescList, PageHeader, btnClass } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/forms";
import { Timeline } from "@/components/ui/nav";
import { ReplBadge, bname, pname } from "@/components/status";
import { CalcDetails } from "@/components/procurement/calc-details";
import { AttachmentLink } from "@/components/file-upload";
import { num, q3 } from "@/lib/num";
import { approveRequestAction, cancelRequestAction, closeRequestAction, sendRequestAction, submitRequestAction } from "../actions";
import { DocumentForm, EditRequestForm, ReceiveForm } from "./forms";

export const metadata = { title: "Replenishment request" };

export default async function ReplenishmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("replenishment.view");
  const { id } = await params;
  const { req, users, events } = await orNotFound(getRequest(actor, id));
  const f = await getFmt();
  const { t, locale } = f;
  const userName = (uid: string | null | undefined) => (uid ? users.find((u) => u.id === uid)?.name ?? "—" : "—");

  const canManage = can(actor, "replenishment.manage");
  const canApprove = can(actor, "replenishment.approve");
  const canReceive = can(actor, "replenishment.receive");
  const editable = EDITABLE.includes(req.status) && canManage;
  const receivable = RECEIVABLE.includes(req.status) && canReceive;
  const anyReceived = req.items.some((i) => num(i.receivedQty) > 0);

  const [suppliers, stock, portalUsers] = await Promise.all([
    editable ? supplierOptions(actor) : Promise.resolve([]),
    stockFor(actor, req.branchId, req.items.map((i) => i.productId)),
    req.supplierId ? supplierPortalUserCount(req.supplierId) : Promise.resolve(0),
  ]);

  const total = req.items.reduce((s, i) => s + num(i.requestedQty) * num(i.unitCost), 0);
  const receivedValue = req.items.reduce((s, i) => s + num(i.receivedQty) * num(i.unitCost), 0);
  const hidden = { id: req.id };

  const actions = [];
  if (["DRAFT"].includes(req.status) && canManage && req.items.length)
    actions.push(<ConfirmAction key="submit" action={submitRequestAction} hidden={hidden} label={t("replenishment.act.submit")} title={t("replenishment.act.submitTitle")} description={t("replenishment.act.submitDesc")} variant="secondary" size="md" />);
  if (EDITABLE.includes(req.status) && canApprove && req.items.length)
    actions.push(<ConfirmAction key="approve" action={approveRequestAction} hidden={hidden} label={t("common.approve")} title={t("replenishment.act.approveTitle")} description={t("replenishment.act.approveDesc", { total: f.money(total) })} reason={t("replenishment.act.approveNote")} variant="success" size="md" />);
  if (req.status === "APPROVED" && canApprove)
    actions.push(
      <ConfirmAction key="send" action={sendRequestAction} hidden={hidden} label={t("replenishment.act.send")} title={t("replenishment.act.sendTitle")} size="md" variant="primary"
        description={!req.supplierId ? t("errors.supplier_required") : portalUsers ? t("replenishment.act.sendDesc", { supplier: req.supplier?.name ?? "" }) : t("replenishment.act.sendNoPortal", { supplier: req.supplier?.name ?? "" })} />,
    );
  if (!["RECEIVED", "CANCELLED", "PARTIALLY_RECEIVED"].includes(req.status) && canManage && !anyReceived && (EDITABLE.includes(req.status) || canApprove))
    actions.push(<ConfirmAction key="cancel" action={cancelRequestAction} hidden={hidden} label={t("replenishment.act.cancel")} title={t("replenishment.act.cancelTitle")} description={t("common.cannotUndo")} reason={t("common.reason")} reasonRequired variant="danger" size="md" />);
  if (req.status === "PARTIALLY_RECEIVED" && canApprove)
    actions.push(<ConfirmAction key="close" action={closeRequestAction} hidden={hidden} label={t("replenishment.act.close")} title={t("replenishment.act.closeTitle")} description={t("replenishment.act.closeDesc")} reason={t("common.reason")} reasonRequired variant="secondary" size="md" />);

  return (
    <>
      <PageHeader
        back={{ href: "/replenishment", label: t("replenishment.title") }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span dir="ltr">REQ-{req.seq}</span>
            <ReplBadge status={req.status} t={t} />
          </span>
        }
        description={`${bname(req.branch, locale)} · ${req.supplier?.name ?? t("replenishment.noSupplier")}`}
        actions={
          <>
            {actions}
            <Link href={`/replenishment/${req.id}/print`} className={btnClass("ghost", "md")}><Printer className="size-4" /> {t("replenishment.printPo")}</Link>
          </>
        }
      />

      {req.status === "APPROVED" && req.supplierId && !portalUsers ? <Alert tone="warn" className="mb-4">{t("replenishment.noPortalWarn")}</Alert> : null}
      {req.supplierNotes ? <Alert tone="info" className="mb-4"><strong>{t("replenishment.supplierNote")}:</strong> {req.supplierNotes}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title={t("common.items")} description={t("replenishment.itemsHint")} />
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t("common.product")}</th>
                    <th className="text-end">{t("replenishment.col.availableNow")}</th>
                    <th className="text-end">{t("replenishment.col.recommended")}</th>
                    <th className="text-end">{t("replenishment.col.requested")}</th>
                    <th className="text-end">{t("replenishment.col.confirmed")}</th>
                    <th className="text-end">{t("replenishment.col.received")}</th>
                    <th className="text-end">{t("replenishment.col.outstanding")}</th>
                    <th className="text-end">{t("common.unitCost")}</th>
                    <th className="text-end">{t("common.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((i) => {
                    const out = Math.max(0, q3(num(i.requestedQty) - num(i.receivedQty)));
                    return (
                      <tr key={i.id}>
                        <td className="align-top">
                          <Link href={`/products/${i.productId}`} className="font-medium text-slate-800 hover:text-brand-700">{pname(i.product, locale)}</Link>
                          <p className="text-xs text-slate-500" dir="ltr">{i.product.sku} · {t(`enums.unit.${i.product.baseUnit}`)}</p>
                        </td>
                        <td className="tnum text-end align-top">{f.num(stock.get(i.productId) ?? 0)}</td>
                        <td className="tnum text-end align-top">
                          {f.num(num(i.recommendedQty))}
                          <CalcDetails calc={i.calculation} f={f} unit={i.product.baseUnit} />
                        </td>
                        <td className="tnum text-end align-top font-medium">{f.num(num(i.requestedQty))}</td>
                        <td className="tnum text-end align-top">{i.supplierConfirmedQty === null ? "—" : f.num(num(i.supplierConfirmedQty))}</td>
                        <td className="tnum text-end align-top">{f.num(num(i.receivedQty))}</td>
                        <td className={`tnum text-end align-top ${out > 0 && ["PARTIALLY_RECEIVED", "IN_TRANSIT", "ACCEPTED"].includes(req.status) ? "font-semibold text-amber-700" : ""}`}>{f.num(out)}</td>
                        <td className="tnum text-end align-top">{f.money(num(i.unitCost))}</td>
                        <td className="tnum text-end align-top">{f.money(num(i.requestedQty) * num(i.unitCost))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} className="px-3 py-2.5 text-end text-sm text-slate-600">{t("replenishment.totalOrdered")}</td>
                    <td className="tnum px-3 py-2.5 text-end font-semibold">{f.money(total)}</td>
                  </tr>
                  {anyReceived ? (
                    <tr>
                      <td colSpan={8} className="px-3 pb-2.5 text-end text-sm text-slate-600">{t("replenishment.totalReceived")}</td>
                      <td className="tnum px-3 pb-2.5 text-end font-semibold text-emerald-700">{f.money(receivedValue)}</td>
                    </tr>
                  ) : null}
                </tfoot>
              </table>
            </div>
          </Card>

          {editable ? (
            <Card>
              <CardHeader title={t("replenishment.editTitle")} description={t("replenishment.editHint")} />
              <CardBody>
                <EditRequestForm
                  id={req.id}
                  branchId={req.branchId}
                  supplierId={req.supplierId}
                  notes={req.notes}
                  suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.name} · ${s.code}` }))}
                  lines={req.items.map((i) => ({
                    productId: i.productId, name: i.product.name, nameAr: i.product.nameAr, sku: i.product.sku, baseUnit: i.product.baseUnit,
                    available: stock.get(i.productId) ?? 0, quantity: num(i.requestedQty), unitCost: num(i.unitCost),
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}

          {receivable ? (
            <Card>
              <CardHeader title={t("replenishment.receiveTitle")} description={t("replenishment.receiveDesc")} />
              <CardBody>
                <ReceiveForm
                  id={req.id}
                  lines={req.items
                    .map((i) => ({ i, out: Math.max(0, q3(num(i.requestedQty) - num(i.receivedQty))) }))
                    .filter((x) => x.out > 0)
                    .map(({ i, out }) => ({
                      id: i.id, name: pname(i.product, locale), sku: i.product.sku, unit: i.product.baseUnit,
                      info: [
                        { label: t("replenishment.col.requested"), value: num(i.requestedQty) },
                        { label: t("replenishment.col.outstanding"), value: out },
                      ],
                      defaultValue: i.supplierConfirmedQty !== null ? Math.min(out, Math.max(0, q3(num(i.supplierConfirmedQty) - num(i.receivedQty)))) : out,
                      max: out,
                    }))}
                />
              </CardBody>
            </Card>
          ) : null}

          {req.receipts.length ? (
            <Card>
              <CardHeader title={t("replenishment.receipts")} />
              <ul className="divide-y divide-slate-100">
                {req.receipts.map((r, n) => (
                  <li key={r.id} className="px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{t("replenishment.receiptN", { n: n + 1 })} · {userName(r.receivedById)}</p>
                      <p className="text-xs text-slate-500">{f.dateTime(r.createdAt)}</p>
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      {r.items.map((ri) => {
                        const it = req.items.find((x) => x.id === ri.itemId);
                        return <li key={ri.id}>{it ? pname(it.product, locale) : "—"}: <span className="tnum font-medium">{f.num(num(ri.quantity))}</span></li>;
                      })}
                    </ul>
                    {r.notes ? <p className="mt-1 text-xs text-slate-500">{r.notes}</p> : null}
                    {r.attachment ? <div className="mt-1"><AttachmentLink id={r.attachment.id} fileName={r.attachment.fileName} /></div> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DescList
                className="sm:grid-cols-1"
                items={[
                  { label: t("common.branch"), value: `${bname(req.branch, locale)} · ${req.branch.code}` },
                  { label: t("common.supplier"), value: req.supplier ? <Link className="text-brand-700 hover:underline" href={`/suppliers/${req.supplier.id}`}>{req.supplier.name}</Link> : "—" },
                  { label: t("replenishment.col.source"), value: t(`enums.source.${req.source}`) },
                  { label: t("replenishment.createdBy"), value: `${req.createdById ? userName(req.createdById) : t("replenishment.system")} · ${f.dateTime(req.createdAt)}` },
                  ...(req.approvedAt ? [{ label: t("replenishment.approvedBy"), value: `${req.approvedById ? userName(req.approvedById) : t("replenishment.autoPolicy")} · ${f.dateTime(req.approvedAt)}` }] : []),
                  ...(req.sentAt ? [{ label: t("replenishment.sentAt"), value: f.dateTime(req.sentAt) }] : []),
                  ...(req.acceptedAt ? [{ label: t("replenishment.acceptedAt"), value: f.dateTime(req.acceptedAt) }] : []),
                  ...(req.expectedAt ? [{ label: t("replenishment.col.expected"), value: f.date(req.expectedAt) }] : []),
                  ...(req.completedAt ? [{ label: t("replenishment.completedAt"), value: f.dateTime(req.completedAt) }] : []),
                  ...(req.cancelReason ? [{ label: t("replenishment.cancelReason"), value: req.cancelReason }] : []),
                  ...(req.notes ? [{ label: t("common.notes"), value: <span className="whitespace-pre-line">{req.notes}</span> }] : []),
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("replenishment.documents")} />
            <CardBody className="space-y-3">
              {req.documents.length ? (
                <ul className="space-y-1.5">
                  {req.documents.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                      <AttachmentLink id={d.attachment.id} fileName={d.label || d.attachment.fileName} />
                      <span className="text-xs text-slate-400">{f.date(d.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t("replenishment.noDocuments")}</p>
              )}
              {req.status !== "CANCELLED" ? <DocumentForm id={req.id} /> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("common.history")} />
            <CardBody>
              <Timeline
                items={events.map((e) => ({
                  id: e.id,
                  title: e.fromStatus === e.toStatus && e.toStatus !== "PARTIALLY_RECEIVED" ? t("replenishment.noteAdded") : t(`enums.replenishment.${e.toStatus}`),
                  meta: `${e.userId ? userName(e.userId) : t("replenishment.system")} · ${f.dateTime(e.createdAt)}`,
                  note: e.note === "auto" ? t("replenishment.autoCreated") : e.note,
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
