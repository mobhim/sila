import { orNotFound } from "@/server/page";
import { requireActor } from "@/server/auth/current";
import { getRequest } from "@/server/replenishment";
import { getSettings } from "@/server/settings";
import { getFmt } from "@/i18n/server";
import { ButtonLink } from "@/components/ui";
import { ReplBadge, bname, pname } from "@/components/status";
import { PrintButton } from "@/components/procurement/print-button";
import { num } from "@/lib/num";

export const metadata = { title: "Purchase order" };

/** Printable purchase order — use the browser's "Save as PDF" for a PDF copy. */
export default async function PrintPurchaseOrder({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("replenishment.view");
  const { id } = await params;
  const { req, users } = await orNotFound(getRequest(actor, id));
  const settings = await getSettings();
  const f = await getFmt();
  const { t, locale } = f;
  const total = req.items.reduce((s, i) => s + num(i.requestedQty) * num(i.unitCost), 0);
  const approver = req.approvedById ? users.find((u) => u.id === req.approvedById)?.name : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <ButtonLink href={`/replenishment/${req.id}`} variant="secondary">{t("common.back")}</ButtonLink>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">{t("replenishment.print.hint")}</p>
          <PrintButton label={t("common.print")} />
        </div>
      </div>
      {!["APPROVED", "SENT_TO_SUPPLIER", "ACCEPTED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "RECEIVED"].includes(req.status) ? (
        <p className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("replenishment.print.notApproved")}</p>
      ) : null}

      <article className="card bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xl font-semibold text-slate-900">{settings.businessName}</p>
            {settings.vatNumber ? <p className="mt-1 text-sm text-slate-600">{t("replenishment.print.vat")}: <span dir="ltr">{settings.vatNumber}</span></p> : null}
          </div>
          <div className="text-end">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("replenishment.print.title")}</h1>
            <p className="mt-1 text-sm text-slate-600" dir="ltr">PO / REQ-{req.seq}</p>
            <p className="text-sm text-slate-600">{f.date(req.approvedAt ?? req.createdAt)}</p>
            <div className="mt-2 no-print"><ReplBadge status={req.status} t={t} /></div>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("replenishment.print.supplier")}</h2>
            {req.supplier ? (
              <div className="mt-2 space-y-0.5 text-sm text-slate-800">
                <p className="font-medium">{req.supplier.name}</p>
                {req.supplier.contactName ? <p>{req.supplier.contactName}</p> : null}
                {req.supplier.phone ? <p dir="ltr" className="text-start">{req.supplier.phone}</p> : null}
                {req.supplier.email ? <p dir="ltr" className="text-start">{req.supplier.email}</p> : null}
                {req.supplier.vatNumber ? <p>{t("replenishment.print.vat")}: <span dir="ltr">{req.supplier.vatNumber}</span></p> : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">{t("replenishment.noSupplier")}</p>
            )}
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("replenishment.print.deliverTo")}</h2>
            <div className="mt-2 space-y-0.5 text-sm text-slate-800">
              <p className="font-medium">{bname(req.branch, locale)} · {req.branch.code}</p>
              {req.branch.address ? <p>{req.branch.address}</p> : null}
              {req.branch.city ? <p>{req.branch.city}</p> : null}
              {req.branch.phone ? <p dir="ltr" className="text-start">{req.branch.phone}</p> : null}
              {req.expectedAt ? <p>{t("replenishment.col.expected")}: {f.date(req.expectedAt)}</p> : null}
            </div>
          </div>
        </section>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-xs text-slate-600">
              <th className="px-2 py-2 text-start">#</th>
              <th className="px-2 py-2 text-start">{t("common.product")}</th>
              <th className="px-2 py-2 text-start">{t("common.sku")}</th>
              <th className="px-2 py-2 text-end">{t("common.quantity")}</th>
              <th className="px-2 py-2 text-start">{t("common.unit")}</th>
              <th className="px-2 py-2 text-end">{t("common.unitCost")}</th>
              <th className="px-2 py-2 text-end">{t("common.total")}</th>
            </tr>
          </thead>
          <tbody>
            {req.items.map((i, n) => (
              <tr key={i.id} className="border-b border-slate-100">
                <td className="px-2 py-2 text-slate-500">{n + 1}</td>
                <td className="px-2 py-2">{pname(i.product, locale)}</td>
                <td className="px-2 py-2" dir="ltr">{i.product.sku}</td>
                <td className="tnum px-2 py-2 text-end">{f.num(num(i.requestedQty))}</td>
                <td className="px-2 py-2">{t(`enums.unit.${i.product.baseUnit}`)}</td>
                <td className="tnum px-2 py-2 text-end">{f.money(num(i.unitCost))}</td>
                <td className="tnum px-2 py-2 text-end">{f.money(num(i.requestedQty) * num(i.unitCost))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="px-2 pt-4 text-end font-medium">{t("replenishment.print.totalExVat")}</td>
              <td className="tnum px-2 pt-4 text-end text-base font-semibold">{f.money(total)}</td>
            </tr>
          </tfoot>
        </table>

        {req.notes ? (
          <section className="mt-6 text-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("common.notes")}</h2>
            <p className="mt-1 whitespace-pre-line text-slate-700">{req.notes}</p>
          </section>
        ) : null}

        <footer className="mt-10 grid gap-8 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">{t("replenishment.approvedBy")}</p>
            <p className="mt-1 font-medium">{approver ?? (req.approvedAt ? t("replenishment.autoPolicy") : "—")}</p>
            <div className="mt-8 border-t border-slate-300 pt-1 text-xs text-slate-500">{t("replenishment.print.signature")}</div>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t("replenishment.print.supplierAck")}</p>
            <div className="mt-14 border-t border-slate-300 pt-1 text-xs text-slate-500">{t("replenishment.print.signature")}</div>
          </div>
        </footer>
        <p className="mt-8 text-center text-[11px] text-slate-400">{t("replenishment.print.generated", { date: f.dateTime(new Date()) })}</p>
      </article>
    </div>
  );
}
