import Link from "next/link";
import { Paperclip } from "lucide-react";
import type { Fmt } from "@/i18n/server";
import type { LedgerRow } from "@/server/ledger-queries";
import { TxBadge, pname, bname } from "@/components/status";

/** Read-only ledger table shared by /transactions and product details. */
export function TxTable({ rows, f, showProduct = true, showBranch = true }: { rows: LedgerRow[]; f: Fmt; showProduct?: boolean; showBranch?: boolean }) {
  const { t, locale } = f;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("transactions.col.ref")}</th>
            <th>{t("transactions.col.date")}</th>
            {showBranch ? <th>{t("transactions.col.branch")}</th> : null}
            {showProduct ? <th>{t("transactions.col.product")}</th> : null}
            <th>{t("transactions.col.type")}</th>
            <th className="text-end">{t("transactions.col.qty")}</th>
            <th className="text-end">{t("transactions.col.balance")}</th>
            <th>{t("transactions.col.user")}</th>
            <th>{t("transactions.col.reason")}</th>
            <th>{t("transactions.col.links")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const qty = Number(r.quantity);
            const unit = t(`enums.unit.${r.product.baseUnit}`);
            const enteredOther = r.enteredUnit !== r.product.baseUnit;
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap font-mono text-xs text-slate-500" dir="ltr">TX-{r.seq}</td>
                <td className="whitespace-nowrap text-xs text-slate-600">{f.dateTime(r.createdAt)}</td>
                {showBranch ? <td className="whitespace-nowrap text-xs">{r.branch.code}</td> : null}
                {showProduct ? (
                  <td className="min-w-40">
                    <Link href={`/products/${r.product.id}`} className="font-medium text-slate-800 hover:text-brand-700">{pname(r.product, locale)}</Link>
                    <span className="block text-xs text-slate-400" dir="ltr">{r.product.sku}</span>
                  </td>
                ) : null}
                <td><TxBadge type={r.type} t={t} /></td>
                <td className={`tnum whitespace-nowrap text-end font-semibold ${qty < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  <span dir="ltr">{qty > 0 ? "+" : ""}{f.num(qty)}</span> <span className="text-xs font-normal text-slate-500">{unit}</span>
                  {enteredOther ? (
                    <span className="block text-[11px] font-normal text-slate-400">{t("transactions.entered", { qty: f.num(Number(r.enteredQuantity)), unit: t(`enums.unit.${r.enteredUnit}`) })}</span>
                  ) : null}
                </td>
                <td className="tnum whitespace-nowrap text-end text-xs text-slate-600" dir="ltr">{f.num(Number(r.previousQty))} → {f.num(Number(r.newQty))}</td>
                <td className="whitespace-nowrap text-xs">{r.user.name}</td>
                <td className="max-w-56 text-xs text-slate-600"><span className="line-clamp-2">{r.reason ?? "—"}</span>{r.notes ? <span className="line-clamp-2 text-slate-400">{r.notes}</span> : null}</td>
                <td className="whitespace-nowrap text-xs">
                  <div className="flex flex-col gap-0.5">
                    {r.replenishment ? <Link className="text-brand-700 hover:underline" href={`/replenishment/${r.replenishment.id}`} dir="ltr">REQ-{r.replenishment.seq}</Link> : null}
                    {r.transfer ? <Link className="text-brand-700 hover:underline" href={`/transfers/${r.transfer.id}`} dir="ltr">TRF-{r.transfer.seq}</Link> : null}
                    {r.count ? <Link className="text-brand-700 hover:underline" href={`/counts/${r.count.id}`} dir="ltr">CNT-{r.count.seq}</Link> : null}
                    {r.adjustment ? <Link className="text-brand-700 hover:underline" href={`/adjustments?tab=history`} dir="ltr">ADJ-{r.adjustment.seq}</Link> : null}
                    {r.attachment ? (
                      <a className="inline-flex items-center gap-1 text-brand-700 hover:underline" href={`/api/files/${r.attachment.id}`} target="_blank" rel="noopener">
                        <Paperclip className="size-3" />{t("common.attachment")}
                      </a>
                    ) : null}
                    {!r.replenishment && !r.transfer && !r.count && !r.adjustment && !r.attachment ? <span className="text-slate-300">—</span> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
