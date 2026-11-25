"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { saveSupplier, type SupplierInput } from "@/server/suppliers";
import { formObject, zBool, zInt, zOpt, zReq } from "@/lib/form";

const schema = z.object({
  code: zReq(20),
  name: zReq(160),
  contactName: zOpt(120),
  phone: zOpt(30),
  whatsapp: zOpt(30),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email("errors.email_invalid").max(200).nullable().optional()),
  address: zOpt(300),
  vatNumber: zOpt(30),
  leadTimeDays: zInt,
  active: zBool,
  notes: zOpt(2000),
});

function parse(fd: FormData): SupplierInput {
  const o = formObject(fd);
  const { active, ...v } = schema.parse({ ...o, active: o.active ?? "false" });
  return { ...v, status: active ? "ACTIVE" : "INACTIVE" } as SupplierInput;
}

export async function saveSupplierAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const id = String(fd.get("id") ?? "") || null;
  return act(async (actor) => (await saveSupplier(actor, id, parse(fd))).id, { revalidate: ["/suppliers"], success: id ? "common.saved" : "suppliers.created" });
}
