import type { Permission } from "@/server/rbac";

export type IconName =
  | "dashboard" | "record" | "inventory" | "ledger" | "alert" | "truck" | "transfer" | "count" | "adjust"
  | "product" | "supplier" | "branch" | "report" | "users" | "audit" | "settings" | "bell" | "history";

export interface NavItem {
  href: string;
  label: string; // i18n key
  icon: IconName;
  perm: Permission;
  /** Hide when the actor also has this permission (e.g. employees' own history). */
  hideIf?: Permission;
  badge?: "alerts" | "approvals" | "adjustments";
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "nav.groupOperations",
    items: [
      { href: "/dashboard", label: "nav.dashboard", icon: "dashboard", perm: "dashboard.view" },
      { href: "/record", label: "nav.record", icon: "record", perm: "movements.record" },
      { href: "/inventory", label: "nav.inventory", icon: "inventory", perm: "inventory.view" },
      { href: "/transactions", label: "nav.transactions", icon: "ledger", perm: "transactions.view" },
      { href: "/record/history", label: "nav.myHistory", icon: "history", perm: "transactions.viewOwn", hideIf: "transactions.view" },
      { href: "/alerts", label: "nav.alerts", icon: "alert", perm: "alerts.view", badge: "alerts" },
      { href: "/replenishment", label: "nav.replenishment", icon: "truck", perm: "replenishment.view", badge: "approvals" },
      { href: "/transfers", label: "nav.transfers", icon: "transfer", perm: "transfers.view" },
      { href: "/counts", label: "nav.counts", icon: "count", perm: "counts.enter" },
      { href: "/adjustments", label: "nav.adjustments", icon: "adjust", perm: "adjustments.approve", badge: "adjustments" },
    ],
  },
  {
    group: "nav.groupCatalog",
    items: [
      { href: "/products", label: "nav.products", icon: "product", perm: "products.view" },
      { href: "/suppliers", label: "nav.suppliers", icon: "supplier", perm: "suppliers.view" },
      { href: "/branches", label: "nav.branches", icon: "branch", perm: "branches.view" },
    ],
  },
  {
    group: "nav.groupAdmin",
    items: [
      { href: "/reports", label: "nav.reports", icon: "report", perm: "reports.view" },
      { href: "/employees", label: "nav.employees", icon: "users", perm: "users.view" },
      { href: "/audit", label: "nav.audit", icon: "audit", perm: "audit.view" },
      { href: "/settings", label: "nav.settings", icon: "settings", perm: "settings.manage" },
    ],
  },
];
