"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { updateProfile } from "@/server/users";
import { formObject, zBool, zOpt, zReq } from "@/lib/form";

const schema = z.object({
  name: zReq(120),
  phone: z.preprocess((v) => (v === "" ? null : v), z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "errors.validation").nullable().optional()),
  locale: z.enum(["ar", "en"]),
  notifyEmail: zBool,
  notifyWhatsapp: zBool,
  notifySms: zBool,
});

export async function saveProfileAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const o = formObject(fd);
    for (const k of ["notifyEmail", "notifyWhatsapp", "notifySms"]) o[k] ??= "false";
    const v = schema.parse(o);
    await updateProfile(actor, { ...v, phone: v.phone ?? null });
  }, { revalidate: ["/"], success: "common.saved" });
}
void zOpt;
