"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import {
  addRequestDocument, approveRequest, cancelRequest, closeRequest, createRequest, receiveRequest, sendToSupplier, submitRequest, updateRequest,
} from "@/server/replenishment";
import { zIdOpt, zOpt } from "@/lib/form";
import { qtyLines, zItems } from "@/components/procurement/parse";
import { AppError } from "@/server/errors";

const id = (fd: FormData) => z.string().min(1).max(64).parse(fd.get("id"));
const reval = ["/replenishment", "/dashboard", "/alerts"];

export async function createRequestAction(_p: ActionResult<string> | null, fd: FormData): Promise<ActionResult<string>> {
  return act(async (actor) => {
    const input = z
      .object({ branchId: z.string().min(1, "errors.branch_required"), supplierId: zIdOpt, notes: zOpt(1000), items: zItems })
      .parse({ branchId: fd.get("branchId"), supplierId: fd.get("supplierId"), notes: fd.get("notes"), items: fd.get("items") });
    const req = await createRequest(actor, { ...input, submit: fd.get("intent") === "submit" });
    return req.id;
  }, { revalidate: reval });
}

export async function updateRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const input = z.object({ supplierId: zIdOpt, notes: zOpt(1000), items: zItems }).parse({ supplierId: fd.get("supplierId"), notes: fd.get("notes"), items: fd.get("items") });
    await updateRequest(actor, id(fd), input);
  }, { revalidate: reval, success: "replenishment.msg.updated" });
}

export async function submitRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => submitRequest(actor, id(fd)), { revalidate: reval });
}

export async function approveRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => approveRequest(actor, id(fd), String(fd.get("reason") ?? "").trim() || undefined), { revalidate: reval });
}

export async function sendRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => sendToSupplier(actor, id(fd)), { revalidate: reval });
}

export async function cancelRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => cancelRequest(actor, id(fd), String(fd.get("reason") ?? "").trim()), { revalidate: reval });
}

export async function closeRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => closeRequest(actor, id(fd), String(fd.get("reason") ?? "").trim()), { revalidate: reval });
}

export async function receiveRequestAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const key = z.string().min(8).max(100).parse(fd.get("idempotencyKey"));
    const lines = qtyLines(fd);
    if (lines.some((l) => l.quantity < 0)) throw new AppError("quantity_invalid");
    await receiveRequest(actor, id(fd), {
      lines,
      notes: String(fd.get("notes") ?? "").trim().slice(0, 1000) || null,
      attachmentId: String(fd.get("attachmentId") ?? "") || null,
      idempotencyKey: key,
    });
  }, { revalidate: [...reval, "/inventory", "/transactions"], success: "replenishment.msg.received" });
}

export async function addDocumentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const att = String(fd.get("attachmentId") ?? "");
    if (!att) throw new AppError("file_empty");
    await addRequestDocument(actor, id(fd), att, String(fd.get("label") ?? "").trim().slice(0, 120) || null);
  }, { revalidate: ["/replenishment", "/supplier"], success: "replenishment.msg.docAdded" });
}
