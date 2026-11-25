"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { createUser, resetPassword, updateUser, type UserInput } from "@/server/users";
import { formObject, zBool, zIdOpt, zOpt, zReq } from "@/lib/form";

const schema = z.object({
  name: zReq(120),
  email: z.string().trim().toLowerCase().email("errors.email_invalid").max(200),
  phone: zOpt(30),
  role: z.enum(["OWNER", "MANAGER", "EMPLOYEE", "SUPPLIER"]),
  active: zBool,
  locale: z.enum(["ar", "en"]),
  supplierId: zIdOpt,
  branchIds: z.array(z.string().max(64)).max(200).default([]),
  primaryBranchId: zIdOpt,
});

function parse(fd: FormData): UserInput {
  const o = formObject(fd);
  if (typeof o.branchIds === "string") o.branchIds = [o.branchIds];
  const v = schema.parse({ ...o, active: o.active ?? "false" });
  // Employees pick one branch via primaryBranchId.
  const branchIds = v.role === "EMPLOYEE" ? (v.primaryBranchId ? [v.primaryBranchId] : []) : v.branchIds;
  return {
    name: v.name, email: v.email, phone: v.phone ?? null, role: v.role, status: v.active ? "ACTIVE" : "INACTIVE", locale: v.locale,
    supplierId: v.supplierId ?? null, branchIds, primaryBranchId: v.primaryBranchId ?? null,
  };
}

export async function createUserAction(_p: ActionResult<{ id: string; temporaryPassword: string }> | null, fd: FormData): Promise<ActionResult<{ id: string; temporaryPassword: string }>> {
  return act(async (actor) => {
    const r = await createUser(actor, parse(fd));
    return { id: r.user.id, temporaryPassword: r.temporaryPassword };
  }, { revalidate: ["/employees"] });
}

export async function updateUserAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("id") ?? "");
  return act(async (actor) => {
    await updateUser(actor, id, parse(fd));
  }, { revalidate: ["/employees"], success: "common.saved" });
}

export async function resetPasswordAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  const id = String(fd.get("id") ?? "");
  return act((actor) => resetPassword(actor, id), { revalidate: ["/employees"] });
}
