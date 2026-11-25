"use server";
import { z } from "zod";
import { act } from "@/server/action";
import { recordMovement } from "@/server/movements";
import { requestAdjustment } from "@/server/adjustments";
import { toggleFavorite } from "@/server/products";
import { zIdOpt, zOpt } from "@/lib/form";
import { db } from "@/server/db";

const recordSchema = z.object({
  branchId: zIdOpt,
  productId: z.string().min(1),
  type: z.enum(["CONSUMPTION", "WITHDRAWAL", "RETURN", "STOCK_RECEIPT", "INITIAL_STOCK"]),
  quantity: z.coerce.number().positive("errors.quantity_invalid").max(1_000_000),
  unit: z.enum(["PIECE", "BOX", "CARTON", "KILOGRAM", "GRAM", "LITER", "MILLILITER", "BOTTLE", "PACK", "METER"]),
  reason: zOpt(300),
  notes: zOpt(1000),
  attachmentId: zIdOpt,
  idempotencyKey: z.string().uuid(),
});

export async function recordAction(_prev: unknown, fd: FormData) {
  return act(async (actor) => {
    const input = recordSchema.parse(Object.fromEntries(fd));
    const { transaction, replayed } = await recordMovement(actor, input);
    const product = await db.product.findUniqueOrThrow({ where: { id: transaction.productId }, select: { name: true, nameAr: true, baseUnit: true } });
    return {
      seq: transaction.seq,
      replayed,
      type: transaction.type,
      quantity: Number(transaction.enteredQuantity),
      unit: transaction.enteredUnit,
      newQty: Number(transaction.newQty),
      baseUnit: product.baseUnit,
      productName: actor.locale === "ar" ? product.nameAr || product.name : product.name,
    };
  });
}

const problemSchema = z.object({
  branchId: zIdOpt,
  productId: z.string().min(1),
  kind: z.enum(["DAMAGED", "EXPIRED", "MISSING"]),
  quantity: z.coerce.number().positive("errors.quantity_invalid"),
  reason: z.string().trim().min(1, "errors.reason_required").max(300),
  notes: zOpt(1000),
  attachmentId: zIdOpt,
  idempotencyKey: z.string().uuid(),
});

export async function reportProblemAction(_prev: unknown, fd: FormData) {
  return act(async (actor) => {
    const input = problemSchema.parse(Object.fromEntries(fd));
    return requestAdjustment(actor, input);
  });
}

export async function toggleFavoriteAction(productId: string) {
  return act(async (actor) => toggleFavorite(actor, z.string().min(1).parse(productId)));
}
