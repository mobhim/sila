import { orNotFound } from "@/server/page";
import { requireActor } from "@/server/auth/current";
import { getRequest } from "@/server/replenishment";
import { getFmt } from "@/i18n/server";
import { isoDay } from "@/i18n/format";
import { Alert, Card, CardBody, CardHeader, DescList, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/forms";
import { Timeline } from "@/components/ui/nav";
import { ReplBadge, bname, pname } from "@/components/status";
import { AttachmentLink } from "@/components/file-upload";
import { num, q3 } from "@/lib/num";
import { declineAction } from "../../actions";
import { AcceptForm, SupplierDocumentForm, UpdateForm } from "./forms";

export const metadata = { title: "Request" };

export default async function SupplierRequest({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("supplier.portal");
  const { id } = await params;
  const { req, events } = await orNotFound(getRequest(actor, id));
  const f = await getFmt();
  const { t, locale } = f;
  const total = req.items.reduce((s, i) => s + num(i.requestedQty) * num(i.unitCost), 0);
  const active = ["ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(req.status);

  return (
    <>
      <PageHeader
        back={{ href: "/supplier", label: t("supplierPortal.requests") }}
        title={<span className="flex flex-wrap items-center gap-3"><span dir="ltr">REQ-{req.seq}</span><ReplBadge status={req.status} t={t} /></span>}
        description={t("supplierPortal.sentOn", { date: f.dateTime(req.sentAt ?? req.createdAt) })}
        actions={req.status === "SENT_TO_SUPPLIER" ? (
          <ConfirmAction action={declineAction} hidden={{ id: req.id }} label={t("supplierPortal.decline")} title={t("supplierPortal.declineTitle")} description={t("supplierPortal.declineDesc")} reason={t("common.reason")} reasonRequired variant="danger" size="md" />
        ) : null}
      />

      {req.status === "CANCELLED" ? <Alert tone="warn" className="mb-4">{t("supplierPortal.cancelled")}{req.cancelReason ? `: ${req.cancelReason}` : ""}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {req.status === "SENT_TO_SUPPLIER" ? (
            <Card>
              <CardHeader title={t("supplierPortal.respondTitle")} description={t("supplierPortal.respondHint")} />
              <CardBody><AcceptForm id={req.id} minDate={isoDay(new Date())} /></CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={t("common.items")} />
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t("common.product")}</th>
                    <th className="text-end">{t("supplierPortal.requested")}</th>
                    <th className="text-end">{t("supplierPortal.confirmedQty")}</th>
                    <th className="text-end">{t("supplierPortal.received")}</th>
                    <th className="text-end">{t("common.unitCost")}</th>
                    <th className="text-end">{t("common.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {req.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <p className="font-medium text-slate-800">{pname(i.product, locale)}</p>
                        <p className="text-xs text-slate-500" dir="ltr">{i.product.sku}{i.product.barcode ? ` · ${i.product.barcode}` : ""}</p>
                      </td>
                      <td className="tnum text-end font-medium">{f.num(num(i.requestedQty))} <span className="text-xs font-normal text-slate-400">{t(`enums.unit.${i.product.baseUnit}`)}</span></td>
                      <td className="tnum text-end">{i.supplierConfirmedQty === null ? "—" : f.num(num(i.supplierConfirmedQty))}</td>
                      <td className="tnum text-end">{f.num(num(i.receivedQty))}</td>
                      <td className="tnum text-end">{f.money(num(i.unitCost))}</td>
                      <td className="tnum text-end">{f.money(num(i.requestedQty) * num(i.unitCost))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="px-3 py-2.5 text-end text-sm text-slate-600">{t("common.total")}</td>
                    <td className="tnum px-3 py-2.5 text-end font-semibold">{f.money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {active ? (
            <Card>
              <CardHeader title={t("supplierPortal.updateTitle")} description={t("supplierPortal.updateHint")} />
              <CardBody>
                <UpdateForm
                  id={req.id}
                  canTransit={req.status === "ACCEPTED"}
                  expected={req.expectedAt ? isoDay(req.expectedAt) : ""}
                  lines={req.items.map((i) => ({
                    id: i.id, name: pname(i.product, locale), sku: i.product.sku, unit: i.product.baseUnit,
                    info: [{ label: t("supplierPortal.requested"), value: num(i.requestedQty) }, { label: t("supplierPortal.received"), value: num(i.receivedQty) }],
                    defaultValue: i.supplierConfirmedQty !== null ? num(i.supplierConfirmedQty) : q3(num(i.requestedQty)),
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t("supplierPortal.deliverTo")} />
            <CardBody>
              <DescList
                className="sm:grid-cols-1"
                items={[
                  { label: t("common.branch"), value: bname(req.branch, locale) },
                  { label: t("common.address"), value: [req.branch.address, req.branch.city].filter(Boolean).join("، ") || "—" },
                  { label: t("common.phone"), value: req.branch.phone ? <a href={`tel:${req.branch.phone}`} dir="ltr" className="text-brand-700">{req.branch.phone}</a> : "—" },
                  { label: t("supplierPortal.expected"), value: f.date(req.expectedAt) },
                  ...(req.notes ? [{ label: t("common.notes"), value: <span className="whitespace-pre-line">{req.notes}</span> }] : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("supplierPortal.documents")} />
            <CardBody className="space-y-3">
              {req.documents.length ? (
                <ul className="space-y-1.5">
                  {req.documents.map((d) => (
                    <li key={d.id}>
                      {d.attachment.supplierId === actor.supplierId ? <AttachmentLink id={d.attachment.id} fileName={d.label || d.attachment.fileName} /> : <span className="text-sm text-slate-600">{d.label || d.attachment.fileName}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t("supplierPortal.noDocuments")}</p>
              )}
              {req.status !== "CANCELLED" ? <SupplierDocumentForm id={req.id} /> : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("common.history")} />
            <CardBody>
              <Timeline items={events.filter((e) => e.fromStatus === e.toStatus || ["SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED", "DECLINED", "CLOSED_SHORT"].includes(e.toStatus)).map((e) => ({
                id: e.id,
                title: e.fromStatus === e.toStatus && e.toStatus !== "PARTIALLY_RECEIVED" ? t("replenishment.noteAdded") : t(`enums.replenishment.${e.toStatus}`),
                meta: f.dateTime(e.createdAt),
                // Internal notes (approvals, cancellations) are the business's; show only supplier-facing ones.
                note: ["ACCEPTED", "IN_TRANSIT", "DECLINED", "CANCELLED"].includes(e.toStatus) || (e.fromStatus === e.toStatus && e.toStatus !== "PARTIALLY_RECEIVED") ? e.note : null,
              }))} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
