"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { approveCount, cancelCount, createCount, enterCounts, rejectCount, submitCount } from "@/server/counts";
import { formObject, zId, zIdOpt, zOpt } from "@/lib/form";

const createSchema = z.object({
  branchId: zId,
  categoryId: zIdOpt,
  notes: zOpt(1000),
  productIds: z.array(z.string().max(64)).max(2000).optional(),
});

export async function createCountAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  return act(async (actor) => {
    const i = createSchema.parse(formObject(fd));
    const c = await createCount(actor, { branchId: i.branchId, categoryId: i.categoryId ?? null, notes: i.notes ?? null, productIds: i.productIds });
    return c.id;
  }, { perm: "counts.manage", revalidate: ["/counts"] });
}

const entriesSchema = z
  .array(z.object({ itemId: z.string().max(64), countedQty: z.number().finite().min(0).nullable(), reason: z.string().max(300).nullable().optional() }))
  .max(5000);

export async function saveCountsAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const id = zId.parse(fd.get("countId"));
    const entries = entriesSchema.parse(JSON.parse(String(fd.get("entries") ?? "[]")));
    if (entries.length) await enterCounts(actor, id, entries.map((e) => ({ ...e, reason: e.reason?.trim() || null })));
  }, { perm: "counts.enter", revalidate: ["/counts"], success: "counts.saved" });
}

const idOnly = (fd: FormData) => zId.parse(fd.get("countId"));
const reason = (fd: FormData) => String(fd.get("reason") ?? "").trim().slice(0, 500);

export async function submitCountAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => submitCount(actor, idOnly(fd)), { perm: "counts.manage", revalidate: ["/counts"] });
}
export async function approveCountAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => approveCount(actor, idOnly(fd), reason(fd) || null), { perm: "counts.approve", revalidate: ["/counts", "/inventory"] });
}
export async function rejectCountAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => rejectCount(actor, idOnly(fd), reason(fd)), { perm: "counts.approve", revalidate: ["/counts"] });
}
export async function cancelCountAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => cancelCount(actor, idOnly(fd), reason(fd)), { perm: "counts.manage", revalidate: ["/counts"] });
}
