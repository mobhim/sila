/** Messages for the "alerts" area. */
export const alerts = {
  ar: {
    title: "تنبيهات المخزون", subtitle: "تُنشأ تلقائياً عند وصول المتاح إلى الحد الأدنى، وتُغلق عند تجاوزه.",
    allLevels: "كل المستويات", status: { ACTIVE: "النشطة", RESOLVED: "المعالجة", ALL: "الكل" },
    col: { product: "الصنف", branch: "الفرع", level: "المستوى", status: "الحالة", current: "المتاح الآن", min: "الحد الأدنى", recommended: "الكمية المقترحة", triggered: "وقت التنبيه", request: "طلب التوريد" },
    acknowledge: "تمت المعاينة", ackTitle: "تأكيد معاينة التنبيه", ackHint: "يبقى التنبيه نشطاً حتى يرتفع المخزون فوق الحد الأدنى.",
    createRequest: "إنشاء طلب توريد", createTitle: "إنشاء طلب توريد من التنبيه", createHint: "سيُنشأ طلب مسودة بالكمية المقترحة ({qty}) مع المورد الافتراضي. يمكنك تعديله قبل الاعتماد.",
    openRequest: "طلب #{no}", empty: "لا توجد تنبيهات", emptyHint: "كل الأصناف المراقبة ضمن الحدود.", resolvedAt: "عولج {date}",
  },
  en: {
    title: "Stock alerts", subtitle: "Created automatically when available stock reaches the minimum, closed when it rises above it.",
    allLevels: "All levels", status: { ACTIVE: "Active", RESOLVED: "Resolved", ALL: "All" },
    col: { product: "Product", branch: "Branch", level: "Level", status: "Status", current: "Available now", min: "Minimum", recommended: "Suggested qty", triggered: "Triggered", request: "Replenishment" },
    acknowledge: "Acknowledge", ackTitle: "Acknowledge alert", ackHint: "The alert stays active until stock rises above the minimum.",
    createRequest: "Create request", createTitle: "Create replenishment from alert", createHint: "A draft request is created with the suggested quantity ({qty}) and the default supplier. You can edit it before approval.",
    openRequest: "Request #{no}", empty: "No alerts", emptyHint: "Every monitored product is within its thresholds.", resolvedAt: "Resolved {date}",
  },
};
