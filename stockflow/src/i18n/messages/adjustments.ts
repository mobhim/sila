/** Messages for the "adjustments" area. */
export const adjustments = {
  ar: {
    title: "التسويات", subtitle: "طلبات التالف والمنتهي والمفقود وتصحيح الرصيد. لا تتغير الكمية إلا بعد الاعتماد.",
    tabs: { pending: "بانتظار الاعتماد", history: "السجل", new: "تسوية جديدة" },
    col: { date: "التاريخ", branch: "الفرع", product: "الصنف", kind: "النوع", qty: "الكمية", reason: "السبب", requestedBy: "مقدم الطلب", reviewedBy: "المراجع", status: "الحالة", attachment: "مرفق" },
    approve: "اعتماد", approveTitle: "اعتماد التسوية", approveHint: "ستُسجَّل حركة في السجل وتتغير الكمية فوراً.", note: "ملاحظة (اختياري)",
    reject: "رفض", rejectTitle: "رفض التسوية", rejectReason: "سبب الرفض",
    emptyPending: "لا توجد طلبات بانتظار الاعتماد", emptyHistory: "لا يوجد سجل بعد",
    newTitle: "تسوية جديدة", newHint: "التسويات التي تنشئها أنت تُعتمد فوراً وتُسجَّل باسمك.",
    kind: "نوع التسوية", qty: "الكمية", qtyHint: "بالوحدة الأساسية. تُخصم من المخزون.", correctionHint: "بالوحدة الأساسية. موجبة للزيادة، سالبة للنقص.",
    reason: "السبب", product: "الصنف", pickProduct: "ابحث عن الصنف", change: "تغيير", submit: "تسجيل التسوية", available: "المتاح: {qty}",
    created: "تم تسجيل التسوية", pending: "أُرسلت للاعتماد",
  },
  en: {
    title: "Adjustments", subtitle: "Damaged, expired, missing and balance corrections. Quantity changes only after approval.",
    tabs: { pending: "Pending approval", history: "History", new: "New adjustment" },
    col: { date: "Date", branch: "Branch", product: "Product", kind: "Kind", qty: "Quantity", reason: "Reason", requestedBy: "Requested by", reviewedBy: "Reviewed by", status: "Status", attachment: "Attachment" },
    approve: "Approve", approveTitle: "Approve adjustment", approveHint: "A ledger transaction is posted and the quantity changes immediately.", note: "Note (optional)",
    reject: "Reject", rejectTitle: "Reject adjustment", rejectReason: "Rejection reason",
    emptyPending: "Nothing awaiting approval", emptyHistory: "No history yet",
    newTitle: "New adjustment", newHint: "Adjustments you create are approved immediately and recorded under your name.",
    kind: "Adjustment kind", qty: "Quantity", qtyHint: "In the base unit. Deducted from stock.", correctionHint: "In the base unit. Positive to add, negative to remove.",
    reason: "Reason", product: "Product", pickProduct: "Search for a product", change: "Change", submit: "Record adjustment", available: "Available: {qty}",
    created: "Adjustment recorded", pending: "Sent for approval",
  },
};
