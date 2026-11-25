import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/rbac";
import { getCount, variance } from "@/server/counts";
import { AppError } from "@/server/errors";
import { getFmt } from "@/i18n/server";
import { Card, CardBody, CardHeader, DescList, PageHeader, Stat } from "@/components/ui";
import { ConfirmAction } from "@/components/ui/forms";
import { Timeline } from "@/components/ui/nav";
import { CountBadge, bname } from "@/components/status";
import { num } from "@/lib/num";
import { CountEntry, type CountLine } from "./entry";
import { approveCountAction, cancelCountAction, rejectCountAction, submitCountAction } from "../actions";

export const metadata = { title: "Stock count" };

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("counts.enter");
  const { id } = await params;
  const data = await getCount(actor, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const { count: c, current, events, users } = data;
  const f = await getFmt();
  const { t, locale } = f;
  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "—";

  const editable = c.status === "IN_PROGRESS";
  const blind = actor.role === "EMPLOYEE" && editable;
  const lines: CountLine[] = c.items.map((i) => ({
    itemId: i.id,
    name: bname(i.product, locale),
    sku: i.product.sku,
    barcode: i.product.barcode,
    unit: i.product.baseUnit,
    costPrice: num(i.product.costPrice),
    systemQty: blind || i.systemQty === null ? null : num(i.systemQty),
    currentQty: blind ? null : current.get(i.productId) ?? 0,
    countedQty: i.countedQty === null ? null : num(i.countedQty),
    reason: i.reason,
  }));

  const counted = c.items.filter((i) => i.countedQty !== null);
  const withVar = counted.map((i) => ({ v: variance(i) ?? 0, cost: num(i.product.costPrice) })).filter((x) => x.v !== 0);
  const gains = withVar.filter((x) => x.v > 0).reduce((s, x) => s + x.v * x.cost, 0);
  const losses = withVar.filter((x) => x.v < 0).reduce((s, x) => s + x.v * x.cost, 0);
  const hidden = { countId: c.id };

  return (
    <>
      <PageHeader
        back={{ href: "/counts", label: t("counts.title") }}
        title={<span className="flex flex-wrap items-center gap-3">{t("counts.no", { no: c.seq })} <CountBadge status={c.status} t={t} /></span>}
        description={`${bname(c.branch, locale)} · ${c.category ? bname(c.category, locale) : t("counts.allProducts")}`}
        actions={
          <>
            {editable && can(actor, "counts.manage") ? (
              <ConfirmAction action={submitCountAction} hidden={hidden} variant="primary" label={t("counts.submit")} title={t("counts.submitTitle")} description={t("counts.submitDescription")} />
            ) : null}
            {c.status === "SUBMITTED" && can(actor, "counts.approve") ? (
              <>
                <ConfirmAction action={rejectCountAction} hidden={hidden} label={t("counts.reject")} title={t("counts.rejectTitle")} reason={t("counts.note")} reasonRequired />
                <ConfirmAction action={approveCountAction} hidden={hidden} variant="success" label={t("counts.approve")} title={t("counts.approveTitle")} description={t("counts.approveDescription")} reason={t("counts.note")} />
              </>
            ) : null}
            {["IN_PROGRESS", "SUBMITTED"].includes(c.status) && can(actor, "counts.manage") ? (
              <ConfirmAction action={cancelCountAction} hidden={hidden} variant="danger" label={t("counts.cancel")} title={t("counts.cancelTitle")} reason={t("common.reason")} reasonRequired />
            ) : null}
          </>
        }
      />

      {!blind ? (
        <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("counts.lines")} value={`${f.num(counted.length)} / ${f.num(c.items.length)}`} />
          <Stat label={t("counts.linesWithVariance")} value={f.num(withVar.length)} tone={withVar.length ? "warn" : "good"} />
          <Stat label={t("counts.gains")} value={f.money(gains)} />
          <Stat label={t("counts.netImpact")} value={f.money(gains + losses)} sub={`${t("counts.losses")}: ${f.money(losses)}`} tone={gains + losses < 0 ? "danger" : "default"} />
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <CountEntry countId={c.id} lines={lines} editable={editable} blind={blind} />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DescList
                className="sm:grid-cols-1"
                items={[
                  { label: t("common.branch"), value: `${bname(c.branch, locale)} · ${c.branch.code}` },
                  { label: t("counts.createdBy"), value: `${userName(c.createdById)} · ${f.dateTime(c.createdAt)}` },
                  ...(c.notes ? [{ label: t("common.notes"), value: c.notes }] : []),
                  ...(c.reviewNote ? [{ label: t("counts.reviewNote"), value: c.reviewNote }] : []),
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("counts.timeline")} />
            <CardBody>
              <Timeline
                items={events.map((e) => ({
                  id: e.id,
                  title: t(`enums.count.${e.toStatus}`),
                  meta: `${userName(e.userId)} · ${f.dateTime(e.createdAt)}`,
                  note: e.note,
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
