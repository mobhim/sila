import {
  LayoutDashboard, ScanLine, Boxes, ScrollText, TriangleAlert, Truck, ArrowLeftRight, ClipboardCheck, SlidersHorizontal,
  Package, Building2, Store, BarChart3, Users, ShieldCheck, Settings, Bell, History, type LucideIcon,
} from "lucide-react";
import type { IconName } from "./nav-config";

export const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard, record: ScanLine, inventory: Boxes, ledger: ScrollText, alert: TriangleAlert, truck: Truck,
  transfer: ArrowLeftRight, count: ClipboardCheck, adjust: SlidersHorizontal, product: Package, supplier: Building2,
  branch: Store, report: BarChart3, users: Users, audit: ShieldCheck, settings: Settings, bell: Bell, history: History,
};
