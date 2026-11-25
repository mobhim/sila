"use server";
import { z } from "zod";
import { AdjustmentKind } from "@prisma/client";
import { act } from "@/server/action";
import { requestAdjustment, reviewAdjustment } from "@/server/adjustments";
import { formObject, zId, zIdOpt, zNum, zOpt, zReq } from "@/lib/form";

export async function approveAdjustmentAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const v = z.object({ id: zId, reason: zOpt(500) }).parse(formObject(fd));
      await reviewAdjustment(actor, v.id, true, v.reason ?? null);
    },
    { perm: "adjustments.approve", revalidate: ["/adjustments", "/inventory", "/transactions"] },
  );
}

export async function rejectAdjustmentAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const v = z.object({ id: zId, reason: zReq(500) }).parse(formObject(fd));
      await reviewAdjustment(actor, v.id, false, v.reason);
    },
    { perm: "adjustments.approve", revalidate: ["/adjustments"] },
  );
}

export async function newAdjustmentAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const v = z
        .object({
          branchId: zIdOpt,
          productId: zId,
          kind: z.nativeEnum(AdjustmentKind),
          quantity: zNum,
          reason: zReq(500),
          notes: zOpt(2000),
          attachmentId: zIdOpt,
          idempotencyKey: z.string().uuid(),
        })
        .parse(formObject(fd));
      const r = await requestAdjustment(actor, {
        branchId: v.branchId ?? null,
        productId: v.productId,
        kind: v.kind,
        quantity: v.quantity,
        reason: v.reason,
        notes: v.notes ?? null,
        attachmentId: v.attachmentId ?? null,
        idempotencyKey: v.idempotencyKey,
      });
      return { autoApproved: r.autoApproved };
    },
    { perm: "adjustments.request", revalidate: ["/adjustments", "/inventory", "/transactions"], success: "adjustments.created" },
  );
}
