"use server";
import { z } from "zod";
import { act, type ActionResult } from "@/server/action";
import { supplierRespond, supplierUpdate } from "@/server/replenishment";
import { markMyNotificationsRead } from "@/server/procurement-queries";
import { parseDay, qtyLines } from "@/components/procurement/parse";
import { AppError } from "@/server/errors";

const id = (fd: FormData) => z.string().min(1).max(64).parse(fd.get("id"));
const note = (fd: FormData, k = "note") => String(fd.get(k) ?? "").trim().slice(0, 1000) || null;
const reval = ["/supplier", "/replenishment"];

export async function acceptAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => supplierRespond(actor, id(fd), true, note(fd), parseDay(fd.get("expectedAt"))), { perm: "supplier.portal", revalidate: reval, success: "supplierPortal.msg.accepted" });
}

export async function declineAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act((actor) => supplierRespond(actor, id(fd), false, note(fd, "reason")), { perm: "supplier.portal", revalidate: reval });
}

export async function updateAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async (actor) => {
    const confirmed = qtyLines(fd);
    if (confirmed.some((c) => c.quantity < 0)) throw new AppError("quantity_invalid");
    const exp = fd.get("expectedAt");
    await supplierUpdate(actor, id(fd), {
      inTransit: fd.get("inTransit") === "on",
      expectedAt: exp ? parseDay(exp) : undefined,
      note: note(fd),
      confirmed,
    });
  }, { perm: "supplier.portal", revalidate: reval, success: "supplierPortal.msg.updated" });
}

export async function markReadAction(fd: FormData) {
  await act((actor) => markMyNotificationsRead(actor, String(fd.get("id") ?? "") || null), { revalidate: ["/supplier"] });
}
