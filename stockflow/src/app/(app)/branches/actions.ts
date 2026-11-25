"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { createBranch, updateBranch, type BranchInput } from "@/server/branches";
import { formObject, zBool, zIdOpt, zInt, zOpt, zReq } from "@/lib/form";

const schema = z.object({
  code: zReq(20),
  name: zReq(120),
  nameAr: zOpt(120),
  address: zOpt(300),
  city: zOpt(80),
  phone: zOpt(30),
  email: zOpt(120),
  managerId: zIdOpt,
  status: z.enum(["ACTIVE", "INACTIVE", "CLOSED"]),
  autoDraftReplenishment: zBool,
  reviewPeriodDays: zInt,
});

function parse(fd: FormData): BranchInput {
  const o = formObject(fd);
  return schema.parse({ ...o, autoDraftReplenishment: o.autoDraftReplenishment ?? "false" }) as BranchInput;
}

export async function createBranchAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  return act(async (actor) => (await createBranch(actor, parse(fd))).id, { revalidate: ["/branches"], success: "branches.created" });
}

export async function updateBranchAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("id") ?? "");
  return act(async (actor) => {
    await updateBranch(actor, id, parse(fd));
  }, { revalidate: ["/branches"], success: "common.saved" });
}
