import { Badge, type Tone } from "./ui";
import type { TFunction } from "@/i18n";

const STOCK: Record<string, Tone> = { NORMAL: "green", LOW: "amber", CRITICAL: "orange", OUT_OF_STOCK: "red", REPLENISHMENT_PENDING: "blue" };
const REPL: Record<string, Tone> = {
  DRAFT: "gray", PENDING_APPROVAL: "amber", APPROVED: "teal", SENT_TO_SUPPLIER: "blue", ACCEPTED: "blue", IN_TRANSIT: "violet",
  PARTIALLY_RECEIVED: "amber", RECEIVED: "green", CANCELLED: "gray", DECLINED: "red", CLOSED_SHORT: "amber",
};
const TRANSFER: Record<string, Tone> = { REQUESTED: "amber", APPROVED: "teal", DISPATCHED: "violet", PARTIALLY_RECEIVED: "amber", COMPLETED: "green", CANCELLED: "gray" };
const COUNT: Record<string, Tone> = { IN_PROGRESS: "blue", SUBMITTED: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "gray" };
const APPROVAL: Record<string, Tone> = { PENDING: "amber", APPROVED: "green", REJECTED: "red" };
const ALERT_STATUS: Record<string, Tone> = { OPEN: "red", ACKNOWLEDGED: "amber", REPLENISHMENT_PENDING: "blue", RESOLVED: "green" };
const DELIVERY: Record<string, Tone> = { PENDING: "amber", SENT: "green", FAILED: "red", NOT_CONFIGURED: "gray", SKIPPED: "gray" };
export const TX_TONE: Record<string, Tone> = {
  INITIAL_STOCK: "teal", CONSUMPTION: "orange", WITHDRAWAL: "orange", STOCK_RECEIPT: "green", PURCHASE_RECEIPT: "green", RETURN: "blue",
  DAMAGED: "red", EXPIRED: "red", TRANSFER_OUT: "violet", TRANSFER_IN: "violet", ADJUSTMENT: "gray", COUNT_CORRECTION: "gray",
};

export function StockBadge({ state, t, pending }: { state: string; t: TFunction; pending?: boolean }) {
  if (pending && state !== "NORMAL") return <Badge tone="blue">{t("enums.stock.REPLENISHMENT_PENDING")}</Badge>;
  return <Badge tone={STOCK[state] ?? "gray"}>{t(`enums.stock.${state}`)}</Badge>;
}
export const ReplBadge = ({ status, t }: { status: string; t: TFunction }) => <Badge tone={REPL[status] ?? "gray"}>{t(`enums.replenishment.${status}`)}</Badge>;
export const TransferBadge = ({ status, t }: { status: string; t: TFunction }) => <Badge tone={TRANSFER[status] ?? "gray"}>{t(`enums.transfer.${status}`)}</Badge>;
export const CountBadge = ({ status, t }: { status: string; t: TFunction }) => <Badge tone={COUNT[status] ?? "gray"}>{t(`enums.count.${status}`)}</Badge>;
export const ApprovalBadge = ({ status, t }: { status: string; t: TFunction }) => <Badge tone={APPROVAL[status] ?? "gray"}>{t(`enums.approval.${status}`)}</Badge>;
export const AlertStatusBadge = ({ status, t }: { status: string; t: TFunction }) => <Badge tone={ALERT_STATUS[status] ?? "gray"}>{t(`enums.alertStatus.${status}`)}</Badge>;
export const DeliveryBadge = ({ status, t }: { status: string; t: TFunction }) => <Badge tone={DELIVERY[status] ?? "gray"}>{t(`enums.delivery.${status}`)}</Badge>;
export const TxBadge = ({ type, t }: { type: string; t: TFunction }) => <Badge tone={TX_TONE[type] ?? "gray"} dot={false}>{t(`enums.tx.${type}`)}</Badge>;

/** Product display name in the current locale. */
export function pname(p: { name: string; nameAr?: string | null }, locale: string) {
  return locale === "ar" ? p.nameAr || p.name : p.name;
}
export const bname = pname;
