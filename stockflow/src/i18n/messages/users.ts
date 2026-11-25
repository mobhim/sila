export const users = {
  ar: {
    title: "المستخدمون", description: "الموظفون والمديرون والموردون وصلاحياتهم.", new: "مستخدم جديد", newTitle: "إضافة مستخدم", edit: "تعديل المستخدم",
    branches: "الفروع المعيّنة", primaryBranch: "الفرع الأساسي", supplier: "المورد المرتبط", lastLogin: "آخر دخول", never: "لم يسجل الدخول",
    resetPassword: "إعادة تعيين كلمة المرور", resetConfirm: "ستُلغى جلسات المستخدم الحالية وتُنشأ كلمة مرور مؤقتة.",
    tempTitle: "كلمة المرور المؤقتة", tempHint: "انسخها وسلّمها للمستخدم الآن — لن تظهر مرة أخرى. سيُطلب منه تغييرها عند أول دخول.",
    created: "تم إنشاء المستخدم", empty: "لا يوجد مستخدمون", emptyHint: "أضف الموظفين وعيّن فروعهم.", locale: "لغة الواجهة",
    roleHint: { OWNER: "وصول كامل لكل الفروع والإعدادات.", MANAGER: "يدير الفروع المعيّنة: الموافقات والتوريد والتحويلات.", EMPLOYEE: "يسجّل الحركات في فرعه فقط.", SUPPLIER: "يرى طلبات التوريد المرسلة لمورده فقط." },
    branchesHint: "الموظف يرتبط بفرع واحد؛ المدير يمكن أن يدير أكثر من فرع.", managerScope: "تظهر لك حسابات الموظفين في فروعك فقط.",
    goToList: "العودة للقائمة", allRoles: "كل الأدوار", allStatuses: "كل الحالات",
  },
  en: {
    title: "Users", description: "Employees, managers, suppliers and their permissions.", new: "New user", newTitle: "Add user", edit: "Edit user",
    branches: "Assigned branches", primaryBranch: "Primary branch", supplier: "Linked supplier", lastLogin: "Last sign-in", never: "Never signed in",
    resetPassword: "Reset password", resetConfirm: "The user’s current sessions will be ended and a temporary password created.",
    tempTitle: "Temporary password", tempHint: "Copy it and hand it to the user now — it will not be shown again. They must change it at first sign-in.",
    created: "User created", empty: "No users", emptyHint: "Add employees and assign their branches.", locale: "Interface language",
    roleHint: { OWNER: "Full access to every branch and setting.", MANAGER: "Runs assigned branches: approvals, replenishment, transfers.", EMPLOYEE: "Records movements in their own branch only.", SUPPLIER: "Sees only replenishment requests sent to their supplier." },
    branchesHint: "Employees belong to one branch; managers can run several.", managerScope: "You only see employee accounts in your branches.",
    goToList: "Back to list", allRoles: "All roles", allStatuses: "All statuses",
  },
};
