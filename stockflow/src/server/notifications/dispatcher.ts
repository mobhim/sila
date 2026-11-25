import { db } from "../db";
import { PROVIDERS } from "./providers";

const BACKOFF_MIN = [1, 5, 15, 60, 240];
export const MAX_ATTEMPTS = BACKOFF_MIN.length;

/**
 * Send due external deliveries. Safe to run concurrently (rows are claimed with
 * FOR UPDATE SKIP LOCKED). Returns counts for monitoring.
 */
export async function dispatchNotifications(limit = 50) {
  const stats = { sent: 0, failed: 0, notConfigured: 0 };
  const claimed = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM notification_deliveries
      WHERE status IN ('PENDING', 'FAILED') AND attempts < ${MAX_ATTEMPTS} AND next_attempt_at <= NOW()
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return [];
    // Push next attempt forward so a concurrent run does not pick them up mid-send.
    await tx.notificationDelivery.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { nextAttemptAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    return rows.map((r) => r.id);
  });

  for (const id of claimed) {
    const d = await db.notificationDelivery.findUnique({ where: { id }, include: { notification: true } });
    if (!d) continue;
    const provider = PROVIDERS[d.channel];
    if (!provider || !provider.configured()) {
      await db.notificationDelivery.update({
        where: { id },
        data: { status: "NOT_CONFIGURED", lastError: provider ? `Missing: ${provider.missing().join(", ")}` : "No provider" },
      });
      stats.notConfigured++;
      continue;
    }
    try {
      const r = await provider.send({ to: d.destination, title: d.notification.title, body: d.notification.body, link: d.notification.link });
      await db.notificationDelivery.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, providerMessageId: r.id ?? null, lastError: null },
      });
      stats.sent++;
    } catch (e) {
      const attempts = d.attempts + 1;
      await db.notificationDelivery.update({
        where: { id },
        data: {
          status: "FAILED",
          attempts,
          lastError: String((e as Error).message ?? e).slice(0, 500),
          nextAttemptAt: new Date(Date.now() + (BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)] ?? 240) * 60000),
        },
      });
      stats.failed++;
    }
  }
  return stats;
}

/** Re-queue deliveries marked NOT_CONFIGURED once a channel has been set up. */
export async function requeueNotConfigured(channel: "EMAIL" | "WHATSAPP" | "SMS") {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const r = await db.notificationDelivery.updateMany({
    where: { channel, status: "NOT_CONFIGURED", createdAt: { gte: since } },
    data: { status: "PENDING", nextAttemptAt: new Date(), attempts: 0 },
  });
  return r.count;
}
