"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { updateSettings } from "@/server/admin-queries";
import { requeueNotConfigured } from "@/server/notifications/dispatcher";
import { requirePermission } from "@/server/rbac";
import { audit } from "@/server/audit";
import { formObject, zBool, zInt, zOpt, zReq } from "@/lib/form";
import { makeT, type Locale } from "@/i18n";

const schema = z.object({
  businessName: zReq(160),
  vatNumber: zOpt(30),
  allowNegativeStock: zBool,
  criticalPercent: zInt,
  consumptionWindowDays: zInt,
  safetyDays: zInt,
  autoDraftReplenishment: zBool,
  autoApproveReplenishment: zBool,
  showHijri: zBool,
  emailEnabled: zBool,
  whatsappEnabled: zBool,
  smsEnabled: zBool,
});

const BOOLS = ["allowNegativeStock", "autoDraftReplenishment", "autoApproveReplenishment", "showHijri", "emailEnabled", "whatsappEnabled", "smsEnabled"];

export async function saveSettingsAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const o = formObject(fd);
    for (const k of BOOLS) o[k] ??= "false";
    const v = schema.parse(o);
    await updateSettings(actor, { ...v, vatNumber: v.vatNumber ?? null });
  }, { perm: "settings.manage", revalidate: ["/"], success: "common.saved" });
}

export async function requeueAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const channel = z.enum(["EMAIL", "WHATSAPP", "SMS"]).parse(fd.get("channel"));
  return act(async (actor) => {
    requirePermission(actor, "settings.manage");
    const n = await requeueNotConfigured(channel);
    await audit(actor, { action: "notifications.requeue", entityType: "settings", summary: `${channel}: ${n}` });
    return makeT(actor.locale as Locale)("settings.requeueDone", { n });
  }, { revalidate: ["/settings"] });
}
