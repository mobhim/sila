import type { Settings } from "@prisma/client";
import { db, type Tx } from "./db";

export async function getSettings(tx?: Tx): Promise<Settings> {
  const c = tx ?? db;
  return (
    (await c.settings.findUnique({ where: { id: 1 } })) ??
    (await c.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }))
  );
}
