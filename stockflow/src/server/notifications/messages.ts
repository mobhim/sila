/** Server-rendered notification texts, per recipient locale. `{x}` placeholders. */
type Msg = { title: string; body: string };
type Catalog = Record<string, { ar: Msg; en: Msg }>;

export const NOTIFICATION_MESSAGES = {
  "alert.LOW": {
    ar: { title: "مخزون منخفض: {product}", body: "{branch}: المتوفر {qty} والحد الأدنى {min}. الكمية المقترحة للتوريد {rec}." },
    en: { title: "Low stock: {product}", body: "{branch}: {qty} available, minimum {min}. Suggested replenishment {rec}." },
  },
  "alert.CRITICAL": {
    ar: { title: "مخزون حرج: {product}", body: "{branch}: المتوفر {qty} فقط والحد الأدنى {min}. الكمية المقترحة {rec}." },
    en: { title: "Critical stock: {product}", body: "{branch}: only {qty} left, minimum {min}. Suggested replenishment {rec}." },
  },
  "alert.OUT_OF_STOCK": {
    ar: { title: "نفد المخزون: {product}", body: "{branch}: لم يعد هناك مخزون متاح. الكمية المقترحة {rec}." },
    en: { title: "Out of stock: {product}", body: "{branch}: no stock available. Suggested replenishment {rec}." },
  },
  "replenishment.draft": {
    ar: { title: "مسودة توريد جديدة #{no}", body: "أُنشئت تلقائياً لفرع {branch} ({items} صنف). راجعها واعتمدها." },
    en: { title: "New replenishment draft #{no}", body: "Created automatically for {branch} ({items} items). Review and approve it." },
  },
  "replenishment.pending": {
    ar: { title: "طلب توريد بانتظار الاعتماد #{no}", body: "{branch}: {items} صنف بانتظار موافقتك." },
    en: { title: "Replenishment awaiting approval #{no}", body: "{branch}: {items} items await your approval." },
  },
  "replenishment.status": {
    ar: { title: "طلب التوريد #{no}: {status}", body: "{branch} — {note}" },
    en: { title: "Replenishment #{no}: {status}", body: "{branch} — {note}" },
  },
  "replenishment.sent": {
    ar: { title: "طلب توريد جديد #{no}", body: "طلب من {business} لفرع {branch}: {items} صنف. افتح البوابة للقبول." },
    en: { title: "New purchase request #{no}", body: "{business} requests {items} items for {branch}. Open the portal to accept." },
  },
  "transfer.status": {
    ar: { title: "تحويل #{no}: {status}", body: "من {from} إلى {to}." },
    en: { title: "Transfer #{no}: {status}", body: "From {from} to {to}." },
  },
  "adjustment.pending": {
    ar: { title: "طلب تسوية بانتظار الاعتماد", body: "{user} في {branch}: {kind} — {product} ({qty})." },
    en: { title: "Adjustment awaiting approval", body: "{user} at {branch}: {kind} — {product} ({qty})." },
  },
  "adjustment.reviewed": {
    ar: { title: "طلب التسوية: {status}", body: "{product} ({qty}). {note}" },
    en: { title: "Adjustment {status}", body: "{product} ({qty}). {note}" },
  },
  "count.submitted": {
    ar: { title: "جرد #{no} بانتظار الاعتماد", body: "{branch}: {variances} فروقات." },
    en: { title: "Count #{no} awaiting approval", body: "{branch}: {variances} variances." },
  },
  "count.reviewed": {
    ar: { title: "الجرد #{no}: {status}", body: "{branch}" },
    en: { title: "Count #{no}: {status}", body: "{branch}" },
  },
} satisfies Catalog;

export type NotificationKey = keyof typeof NOTIFICATION_MESSAGES;

export function renderMessage(key: NotificationKey, locale: string, params: Record<string, string | number>) {
  const m = NOTIFICATION_MESSAGES[key][locale === "en" ? "en" : "ar"];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
  return { title: fill(m.title), body: fill(m.body) };
}

export const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft" },
  PENDING_APPROVAL: { ar: "بانتظار الاعتماد", en: "Pending approval" },
  APPROVED: { ar: "معتمد", en: "Approved" },
  SENT_TO_SUPPLIER: { ar: "أُرسل للمورد", en: "Sent to supplier" },
  ACCEPTED: { ar: "قبله المورد", en: "Accepted" },
  IN_TRANSIT: { ar: "في الطريق", en: "In transit" },
  PARTIALLY_RECEIVED: { ar: "استلام جزئي", en: "Partially received" },
  RECEIVED: { ar: "مستلم", en: "Received" },
  CANCELLED: { ar: "ملغى", en: "Cancelled" },
  REQUESTED: { ar: "مطلوب", en: "Requested" },
  DISPATCHED: { ar: "مُرسل", en: "Dispatched" },
  COMPLETED: { ar: "مكتمل", en: "Completed" },
  REJECTED: { ar: "مرفوض", en: "Rejected" },
  DECLINED: { ar: "اعتذر المورد", en: "Declined by supplier" },
};

export function statusLabel(status: string, locale: string) {
  return STATUS_LABELS[status]?.[locale === "en" ? "en" : "ar"] ?? status;
}
