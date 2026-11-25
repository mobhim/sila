import { db, type Tx } from "./db";

export async function recordEvent(
  tx: Tx | undefined,
  e: { entityType: string; entityId: string; from?: string | null; to: string; userId?: string | null; note?: string | null },
) {
  await (tx ?? db).workflowEvent.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      fromStatus: e.from ?? null,
      toStatus: e.to,
      userId: e.userId ?? null,
      note: e.note ?? null,
    },
  });
}

export function listEvents(entityType: string, entityId: string) {
  return db.workflowEvent.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "asc" } });
}
