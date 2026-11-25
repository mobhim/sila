/** Direct movements recorded from the employee screen and the stock-receipt form. */
import type { TxType, Unit } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./errors";
import { can, requirePermission, workingBranch, type Actor } from "./rbac";
import { postMovements } from "./inventory/ledger";
import { rateLimit } from "./auth/rate-limit";
import { audit } from "./audit";

export const EMPLOYEE_TYPES: TxType[] = ["CONSUMPTION", "WITHDRAWAL", "RETURN"];
export const RECEIVER_TYPES: TxType[] = ["STOCK_RECEIPT", "INITIAL_STOCK"];

export interface RecordInput {
  branchId?: string | null;
  productId: string;
  type: TxType;
  quantity: number;
  unit?: Unit;
  reason?: string | null;
  notes?: string | null;
  attachmentId?: string | null;
  idempotencyKey: string;
}

export async function recordMovement(actor: Actor, input: RecordInput) {
  if (EMPLOYEE_TYPES.includes(input.type)) requirePermission(actor, "movements.record");
  else if (RECEIVER_TYPES.includes(input.type)) requirePermission(actor, "movements.receive");
  else throw new AppError("type_not_allowed"); // damage/expiry/adjustments go through approval

  if (!(input.quantity > 0) || input.quantity > 1_000_000) throw new AppError("quantity_invalid");
  if (!(await rateLimit(`mv:${actor.id}`, 120, 60))) throw new AppError("rate_limited", {}, 429);

  const branchId = workingBranch(actor, input.branchId);

  if (input.type === "INITIAL_STOCK") {
    const prior = await db.inventoryTransaction.count({ where: { branchId, productId: input.productId } });
    if (prior > 0) throw new AppError("initial_stock_exists");
  }
  if (input.attachmentId) {
    const att = await db.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!att || att.uploadedById !== actor.id) throw new AppError("not_found", {}, 404);
  }

  const res = await postMovements(actor, {
    branchId,
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        productId: input.productId,
        type: input.type,
        quantity: input.quantity,
        unit: input.unit,
        reason: input.reason,
        notes: input.notes,
        attachmentId: input.attachmentId,
      },
    ],
  });
  if (RECEIVER_TYPES.includes(input.type) && !res.replayed) {
    await audit(actor, {
      action: `movement.${input.type.toLowerCase()}`,
      entityType: "inventory_transaction",
      entityId: res.transactions[0].id,
      branchId,
      after: { productId: input.productId, quantity: input.quantity, unit: input.unit },
    });
  }
  return { transaction: res.transactions[0], replayed: res.replayed };
}

/** Types the actor may pick on the recording screen. */
export function allowedTypes(actor: Actor): TxType[] {
  const t: TxType[] = [];
  if (can(actor, "movements.record")) t.push(...EMPLOYEE_TYPES);
  if (can(actor, "movements.receive")) t.push(...RECEIVER_TYPES);
  return t;
}
