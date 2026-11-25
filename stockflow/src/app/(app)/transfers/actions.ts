"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { approveTransfer, cancelTransfer, closeTransfer, createTransfer, dispatchTransfer, receiveTransfer } from "@/server/transfers";
import { zOpt } from "@/lib/form";
import { qtyLines, zItems } from "@/components/procurement/parse";
import { AppError } from "@/server/errors";

const id = (fd: FormData) => z.string().min(1).max(64).parse(fd.get("id"));
const key = (fd: FormData) => z.string().min(8).max(100).parse(fd.get("idempotencyKey"));
const reval = ["/transfers", "/inventory", "/transactions", "/dashboard"];

export async function createTransferAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  return act(async (actor) => {
    const input = z
      .object({ sourceBranchId: z.string().min(1, "errors.branch_required"), destinationBranchId: z.string().min(1, "errors.branch_required"), notes: zOpt(1000), items: zItems })
      .parse({ sourceBranchId: fd.get("sourceBranchId"), destinationBranchId: fd.get("destinationBranchId"), notes: fd.get("notes"), items: fd.get("items") });
    const tr = await createTransfer(actor, { ...input, items: input.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) });
    return tr.id;
  }, { revalidate: reval });
}

export async function approveTransferAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => approveTransfer(actor, id(fd), String(fd.get("reason") ?? "").trim() || null), { revalidate: reval });
}

export async function dispatchTransferAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const lines = qtyLines(fd);
    if (lines.some((l) => l.quantity < 0)) throw new AppError("quantity_invalid");
    await dispatchTransfer(actor, id(fd), { lines, note: String(fd.get("notes") ?? "").trim() || null, idempotencyKey: key(fd) });
  }, { revalidate: reval, success: "transfers.msg.dispatched" });
}

export async function receiveTransferAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const lines = qtyLines(fd);
    if (lines.some((l) => l.quantity < 0)) throw new AppError("quantity_invalid");
    await receiveTransfer(actor, id(fd), { lines, note: String(fd.get("notes") ?? "").trim() || null, idempotencyKey: key(fd) });
  }, { revalidate: reval, success: "transfers.msg.received" });
}

export async function closeTransferAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => closeTransfer(actor, id(fd), String(fd.get("reason") ?? "").trim()), { revalidate: reval });
}

export async function cancelTransferAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => cancelTransfer(actor, id(fd), String(fd.get("reason") ?? "").trim()), { revalidate: reval });
}
