import type { Role, Unit } from "@prisma/client";
import { db } from "@/server/db";
import type { Actor } from "@/server/rbac";
import { loadActor } from "@/server/auth/session";

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'settings')`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await db.settings.update({
    where: { id: 1 },
    data: { allowNegativeStock: false, autoDraftReplenishment: true, autoApproveReplenishment: false, criticalPercent: 50, consumptionWindowDays: 30, safetyDays: 2 },
  });
}

export async function makeBranch(over: Partial<{ code: string; name: string; autoDraftReplenishment: boolean }> = {}) {
  const id = uid();
  return db.branch.create({ data: { code: over.code ?? `B${id}`, name: over.name ?? `Branch ${id}`, autoDraftReplenishment: over.autoDraftReplenishment ?? true } });
}

export async function makeSupplier(leadTimeDays = 3) {
  const id = uid();
  return db.supplier.create({ data: { code: `S${id}`, name: `Supplier ${id}`, leadTimeDays } });
}

export async function makeProduct(over: Partial<{ supplierId: string; cost: number; baseUnit: Unit; cartonOf: number }> = {}) {
  const id = uid();
  return db.product.create({
    data: {
      sku: `SKU-${id}`,
      name: `Product ${id}`,
      baseUnit: over.baseUnit ?? "PIECE",
      costPrice: over.cost ?? 10,
      defaultSupplierId: over.supplierId ?? null,
      ...(over.cartonOf ? { units: { create: [{ unit: "CARTON", factor: over.cartonOf, isOrderUnit: true }] } } : {}),
    },
  });
}

export async function makeUser(role: Role, branchIds: string[] = [], supplierId?: string): Promise<Actor> {
  const id = uid();
  const u = await db.user.create({
    data: {
      name: `${role} ${id}`,
      email: `${role.toLowerCase()}-${id}@test.local`,
      passwordHash: "x",
      role,
      supplierId: supplierId ?? null,
      branches: { create: branchIds.map((b, i) => ({ branchId: b, isPrimary: i === 0 })) },
    },
  });
  return (await loadActor(u.id))!;
}

export async function setThresholds(branchId: string, productId: string, t: { min?: number; reorder?: number; max?: number; critical?: number | null }) {
  return db.branchInventory.upsert({
    where: { branchId_productId: { branchId, productId } },
    create: { branchId, productId, minStock: t.min ?? 0, reorderQty: t.reorder ?? 0, maxStock: t.max ?? 0, criticalStock: t.critical ?? null },
    update: { minStock: t.min ?? 0, reorderQty: t.reorder ?? 0, maxStock: t.max ?? 0, criticalStock: t.critical ?? null },
  });
}

export async function qty(branchId: string, productId: string) {
  const inv = await db.branchInventory.findUnique({ where: { branchId_productId: { branchId, productId } } });
  return inv ? Number(inv.quantity) : 0;
}

export const key = () => crypto.randomUUID();
