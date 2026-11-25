import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import type { Actor } from "./rbac";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

function json(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}

export async function audit(actor: Actor | null, entry: AuditEntry, tx?: Tx) {
  await (tx ?? db).auditLog.create({
    data: {
      userId: actor?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      branchId: entry.branchId ?? null,
      summary: entry.summary,
      before: json(entry.before),
      after: json(entry.after),
      ip: actor?.ip ?? null,
      userAgent: actor?.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/** Return only the keys whose values differ, for compact before/after records. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const x = before[k] === undefined || before[k] === null ? null : String(before[k]);
    const y = after[k] === undefined || after[k] === null ? null : String(after[k]);
    if (x !== y) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
