export const dashboard = {
  ar: {
    title: "لوحة التحكم",
    reviewRequests: "مراجعة طلبات التوريد",
    kpi: {
      value: "قيمة المخزون", qtySub: "{qty} وحدة أساسية", branches: "الفروع النشطة", productsSub: "{n} صنف نشط · {stocked} مخزّن",
      low: "أصناف منخفضة", critical: "أصناف حرجة", out: "أصناف نافدة", pending: "طلبات توريد مفتوحة", awaiting: "{n} بانتظار الاعتماد",
      today: "استهلاك اليوم", month: "استهلاك الشهر", units: "{n} وحدة", adjustments: "تسويات بانتظار الاعتماد", alerts: "تنبيهات نشطة",
    },
    trend: "حركة المخزون — آخر ٣٠ يوماً", trendHint: "الوارد (استلام، إرجاع، تسويات موجبة) مقابل الصادر (استهلاك، سحب، تالف). التحويلات مستثناة.",
    inflow: "وارد", outflow: "صادر", alerts: "أهم التنبيهات", viewAll: "عرض الكل", availableOf: "المتاح {qty} من حد {min}",
    noAlerts: "لا توجد تنبيهات", noAlertsHint: "كل الأصناف المراقبة فوق الحد الأدنى.",
    topConsumed: "الأكثر استهلاكاً", last30: "آخر ٣٠ يوماً", lowestDays: "الأقرب للنفاد", lowestDaysHint: "الأيام المتبقية بمعدل الاستهلاك الحالي",
    byCategory: "قيمة المخزون حسب التصنيف", uncategorised: "بدون تصنيف", comparison: "مقارنة الفروع", fastest: "أعلى معدل استهلاك", fastestHint: "متوسط الاستهلاك اليومي",
    col: { value: "قيمة المخزون", availability: "التوفر", low: "تحت الحد", consumption: "الاستهلاك", requests: "طلبات التوريد" },
  },
  en: {
    title: "Dashboard",
    reviewRequests: "Review replenishment",
    kpi: {
      value: "Inventory value", qtySub: "{qty} base units", branches: "Active branches", productsSub: "{n} active products · {stocked} stocked",
      low: "Low stock", critical: "Critical stock", out: "Out of stock", pending: "Open replenishment", awaiting: "{n} awaiting approval",
      today: "Consumption today", month: "Consumption this month", units: "{n} units", adjustments: "Adjustments to approve", alerts: "Active alerts",
    },
    trend: "Stock movement — last 30 days", trendHint: "Inflow (receipts, returns, positive adjustments) vs outflow (consumption, withdrawal, damage). Transfers excluded.",
    inflow: "Inflow", outflow: "Outflow", alerts: "Top alerts", viewAll: "View all", availableOf: "{qty} available, minimum {min}",
    noAlerts: "No alerts", noAlertsHint: "Every monitored product is above its minimum.",
    topConsumed: "Most consumed", last30: "Last 30 days", lowestDays: "Closest to running out", lowestDaysHint: "Days left at the current consumption rate",
    byCategory: "Inventory value by category", uncategorised: "Uncategorised", comparison: "Branch comparison", fastest: "Highest consumption rate", fastestHint: "Average daily consumption",
    col: { value: "Inventory value", availability: "Availability", low: "Below minimum", consumption: "Consumption", requests: "Requests" },
  },
};
