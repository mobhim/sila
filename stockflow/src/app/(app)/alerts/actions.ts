"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { act } from "@/server/action";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { acknowledgeAlert } from "@/server/alerts";
import { createRequest } from "@/server/replenishment";
import { assertBranchAccess } from "@/server/rbac";
import { formObject, zId } from "@/lib/form";

export async function acknowledgeAlertAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const { id } = z.object({ id: zId }).parse(formObject(fd));
      await acknowledgeAlert(actor, id);
    },
    { perm: "alerts.manage", revalidate: ["/alerts", "/dashboard"] },
  );
}

/** Create a draft replenishment request from an alert, then open it. */
export async function createRequestFromAlertAction(_prev: unknown, fd: FormData) {
  const res = await act(
    async (actor) => {
      const { id } = z.object({ id: zId }).parse(formObject(fd));
      const alert = await db.stockAlert.findUnique({ where: { id }, include: { product: { select: { defaultSupplierId: true } } } });
      if (!alert) throw notFound();
      assertBranchAccess(actor, alert.branchId);
      if (alert.replenishmentId) return alert.replenishmentId;
      const rec = Number(alert.recommendedQty);
      const qty = rec > 0 ? rec : Math.max(1, Number(alert.minStockAtTrigger) - Number(alert.currentQuantity) + 1);
      const req = await createRequest(actor, {
        branchId: alert.branchId,
        supplierId: alert.product.defaultSupplierId,
        items: [{ productId: alert.productId, quantity: qty }],
      });
      return req.id;
    },
    { perm: "replenishment.manage", revalidate: ["/alerts", "/replenishment"] },
  );
  if (res.ok && res.data) redirect(`/replenishment/${res.data}`);
  return res;
}
