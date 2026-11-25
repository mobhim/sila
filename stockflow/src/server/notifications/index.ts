import type { Channel } from "@prisma/client";
import { db, type Tx } from "../db";
import { getSettings } from "../settings";
import { renderMessage, type NotificationKey } from "./messages";

export interface NotifyInput {
  userIds: string[];
  type: string;
  key: NotificationKey;
  params: Record<string, string | number>;
  severity?: "info" | "warning" | "critical" | "success";
  link?: string;
  data?: Record<string, unknown>;
  /** Also queue email / WhatsApp / SMS for users who opted in. */
  external?: boolean;
}

/**
 * Create in-app notifications and queue external deliveries (outbox) in the caller's
 * transaction. Deliveries are sent later by the dispatcher, with retries.
 */
export async function notify(tx: Tx | undefined, input: NotifyInput) {
  const c = tx ?? db;
  const ids = [...new Set(input.userIds)];
  if (!ids.length) return;
  const users = await c.user.findMany({ where: { id: { in: ids }, status: "ACTIVE" } });
  const settings = input.external ? await getSettings(tx) : null;

  for (const u of users) {
    const { title, body } = renderMessage(input.key, u.locale, input.params);
    const deliveries: { channel: Channel; destination: string }[] = [];
    if (settings) {
      if (settings.emailEnabled && u.notifyEmail && u.email) deliveries.push({ channel: "EMAIL", destination: u.email });
      if (settings.whatsappEnabled && u.notifyWhatsapp && u.phone) deliveries.push({ channel: "WHATSAPP", destination: u.phone });
      if (settings.smsEnabled && u.notifySms && u.phone) deliveries.push({ channel: "SMS", destination: u.phone });
    }
    await c.notification.create({
      data: {
        userId: u.id,
        type: input.type,
        severity: input.severity ?? "info",
        title,
        body,
        link: input.link,
        data: (input.data ?? undefined) as object | undefined,
        deliveries: deliveries.length ? { create: deliveries } : undefined,
      },
    });
  }
}

/** Active owners plus active managers assigned to any of the branches. */
export async function branchSupervisors(tx: Tx | undefined, branchIds: string[]): Promise<string[]> {
  const c = tx ?? db;
  const users = await c.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ role: "OWNER" }, { role: "MANAGER", branches: { some: { branchId: { in: branchIds } } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function supplierUsers(tx: Tx | undefined, supplierId: string): Promise<string[]> {
  const c = tx ?? db;
  const users = await c.user.findMany({ where: { supplierId, role: "SUPPLIER", status: "ACTIVE" }, select: { id: true } });
  return users.map((u) => u.id);
}
