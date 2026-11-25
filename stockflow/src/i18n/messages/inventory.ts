/** Messages for the "inventory" area. */
export const inventory = {
  ar: {
    title: "المخزون", subtitle: "الرصيد الحالي لكل صنف في كل فرع، محسوباً من سجل الحركات.",
    tabs: { all: "الكل", attention: "يحتاج متابعة", low: "منخفض", critical: "حرج", out: "نافد" },
    list: "قائمة", compare: "مقارنة الفروع", compareHint: "كل صف صنف، وكل عمود فرع. اللون يعكس حالة المخزون.",
    sort: { label: "الترتيب", state: "الأولوية", name: "الاسم", available: "الأقل توفراً", days: "الأقرب للنفاد", value: "الأعلى قيمة" },
    col: { product: "الصنف", branch: "الفرع", available: "المتاح", min: "الحد الأدنى", state: "الحالة", adc: "الاستهلاك/يوم", days: "أيام متبقية", value: "القيمة" },
    searchPlaceholder: "ابحث بالاسم أو الرمز أو الباركود", empty: "لا توجد أصناف مطابقة", emptyHint: "غيّر التصفية أو أضف حدود المخزون من صفحة الصنف.",
    receive: "استلام مخزون", notStocked: "غير مخزَّن", totalValue: "قيمة النتائج", reserved: "محجوز {n}",
  },
  en: {
    title: "Inventory", subtitle: "Current balance of every product in every branch, computed from the ledger.",
    tabs: { all: "All", attention: "Needs attention", low: "Low", critical: "Critical", out: "Out of stock" },
    list: "List", compare: "Compare branches", compareHint: "Each row is a product, each column a branch. Colour reflects stock status.",
    sort: { label: "Sort", state: "Priority", name: "Name", available: "Lowest available", days: "Closest to running out", value: "Highest value" },
    col: { product: "Product", branch: "Branch", available: "Available", min: "Minimum", state: "Status", adc: "Use/day", days: "Days left", value: "Value" },
    searchPlaceholder: "Search by name, SKU or barcode", empty: "No matching products", emptyHint: "Change the filters or set thresholds from the product page.",
    receive: "Receive stock", notStocked: "Not stocked", totalValue: "Value of results", reserved: "{n} reserved",
  },
};
