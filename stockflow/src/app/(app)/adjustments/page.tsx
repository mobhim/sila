import Link from "next/link";
import { requireActor } from "@/server/auth/current";
import { hasBranchAccess } from "@/server/rbac";
import { getSelectedBranch } from "@/server/branch-selection";
import { branchOptions } from "@/server/branches";
import { listAdjustments } from "@/server/adjustments";
import { getFmt, type Fmt } from "@/i18n/server";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/forms";
import { Pagination, Tabs, withParams } from "@/components/ui/nav";
import { ApprovalBadge, bname, pname } from "@/components/status";
import { AttachmentLink } from "@/components/file-upload";
import { AdjustmentForm } from "@/components/inventory/adjustment-form";
import { approveAdjustmentAction, newAdjustmentAction, rejectAdjustmentAction } from "./actions";

export const metadata = { title: "Adjustments" };

type SP = Record<string, string | undefined>;

export default async function AdjustmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor("adjustments.approve");
  const sp = await searchParams;
  const f = await getFmt();
  const { t, locale } = f;
  const tab = sp.tab === "history" || sp.tab === "new" ? sp.tab : "pending";
  const selected = await getSelectedBranch(actor);
  const branchId = selected && hasBranchAccess(actor, selected) ? selected : undefined;
  const [pendingData, branches] = await Promise.all([listAdjustments(actor, { status: "PENDING", branchId, page: tab === "pending" ? Number(sp.page) || 1 : 1 }), branchOptions(actor)]);

  const tabs = [
    { key: "pending", label: t("adjustments.tabs.pending"), href: withParams("/adjustments", {}, {}), count: pendingData.total },
    { key: "history", label: t("adjustments.tabs.history"), href: withParams("/adjustments", {}, { tab: "history" }) },
    { key: "new", label: t("adjustments.tabs.new"), href: withParams("/adjustments", {}, { tab: "new" }) },
  ];

  let body: React.ReactNode;
  if (tab === "new") {
    body = (
      <Card className="max-w-2xl">
        <CardHeader title={t("adjustments.newTitle")} description={t("adjustments.newHint")} />
        <CardBody>
          <AdjustmentForm action={newAdjustmentAction} branches={branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))} defaultBranchId={branchId ?? null} />
        </CardBody>
      </Card>
    );
  } else {
    const data = tab === "pending" ? pendingData : await historyData(actor, branchId, Number(sp.page) || 1);
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    body = (
      <Card>
        {data.rows.length ? (
          <AdjTable rows={data.rows} f={f} pending={tab === "pending"} />
        ) : (
          <EmptyState title={tab === "pending" ? t("adjustments.emptyPending") : t("adjustments.emptyHistory")} />
        )}
        <Pagination
          path="/adjustments"
          params={sp}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          labels={{ prev: t("common.prev"), next: t("common.next"), summary: `${t("common.results", { n: f.num(data.total) })} · ${t("common.page", { page: data.page, pages })}` }}
        />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={t("adjustments.title")} description={t("adjustments.subtitle")} />
      <Tabs active={tab} items={tabs} />
      {body}
    </>
  );
}

async function historyData(actor: Awaited<ReturnType<typeof requireActor>>, branchId: string | undefined, page: number) {
  // History = everything reviewed (approved or rejected), newest first.
  const [a, r] = await Promise.all([listAdjustments(actor, { status: "APPROVED", branchId, page }), listAdjustments(actor, { status: "REJECTED", branchId, page })]);
  const rows = [...a.rows, ...r.rows].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  return { rows, total: Math.max(a.total, r.total), page, pageSize: a.pageSize };
}

type Row = Awaited<ReturnType<typeof listAdjustments>>["rows"][number];

function AdjTable({ rows, f, pending }: { rows: Row[]; f: Fmt; pending: boolean }) {
  const { t, locale } = f;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>{t("adjustments.col.date")}</th>
            <th>{t("adjustments.col.branch")}</th>
            <th>{t("adjustments.col.product")}</th>
            <th>{t("adjustments.col.kind")}</th>
            <th className="text-end">{t("adjustments.col.qty")}</th>
            <th>{t("adjustments.col.reason")}</th>
            <th>{t("adjustments.col.requestedBy")}</th>
            {pending ? null : <th>{t("adjustments.col.reviewedBy")}</th>}
            <th>{t("adjustments.col.status")}</th>
            {pending ? <th><span className="sr-only">{t("common.actions")}</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const qty = Number(r.quantity);
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs text-slate-600">
                  <span className="block font-mono text-slate-400" dir="ltr">ADJ-{r.seq}</span>
                  {f.dateTime(r.createdAt)}
                </td>
                <td className="whitespace-nowrap text-xs">{bname(r.branch, locale)}</td>
                <td className="min-w-40">
                  <Link href={`/products/${r.product.id}`} className="font-medium text-slate-800 hover:text-brand-700">{pname(r.product, locale)}</Link>
                  <span className="block font-mono text-xs text-slate-400" dir="ltr">{r.product.sku}</span>
                </td>
                <td><Badge tone={r.kind === "CORRECTION" ? "gray" : "red"} dot={false}>{t(`enums.adjustmentKind.${r.kind}`)}</Badge></td>
                <td className={`tnum whitespace-nowrap text-end font-semibold ${qty < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                  <span dir="ltr">{qty > 0 ? "+" : ""}{f.num(qty)}</span> <span className="text-xs font-normal text-slate-500">{t(`enums.unit.${r.product.baseUnit}`)}</span>
                </td>
                <td className="max-w-64 text-xs text-slate-600">
                  <span className="line-clamp-2">{r.reason}</span>
                  {r.notes ? <span className="line-clamp-2 text-slate-400">{r.notes}</span> : null}
                  {r.attachment ? <AttachmentLink id={r.attachment.id} fileName={r.attachment.fileName} /> : null}
                </td>
                <td className="whitespace-nowrap text-xs">{r.requestedBy.name}</td>
                {pending ? null : (
                  <td className="text-xs">
                    {r.reviewedBy?.name ?? "—"}
                    {r.reviewedAt ? <span className="block text-slate-400">{f.dateTime(r.reviewedAt)}</span> : null}
                    {r.reviewNote ? <span className="block text-slate-500">{r.reviewNote}</span> : null}
                  </td>
                )}
                <td><ApprovalBadge status={r.status} t={t} /></td>
                {pending ? (
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <ConfirmAction action={approveAdjustmentAction} hidden={{ id: r.id }} label={t("adjustments.approve")} title={t("adjustments.approveTitle")} description={t("adjustments.approveHint")} reason={t("adjustments.note")} variant="success" />
                      <ConfirmAction action={rejectAdjustmentAction} hidden={{ id: r.id }} label={t("adjustments.reject")} title={t("adjustments.rejectTitle")} reason={t("adjustments.rejectReason")} reasonRequired variant="danger" />
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
