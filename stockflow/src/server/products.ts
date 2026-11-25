import type { RecordStatus, Unit, Prisma as P } from "@prisma/client";
import { db } from "./db";
import { AppError, isUniqueViolation, notFound } from "./errors";
import { branchWhere, requirePermission, type Actor } from "./rbac";
import { audit, diff } from "./audit";
import { num } from "@/lib/num";

export interface ProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  categoryId?: string | null;
  baseUnit: Unit;
  defaultSupplierId?: string | null;
  costPrice: number;
  sellingPrice?: number | null;
  status: RecordStatus;
  imageId?: string | null;
  units: { unit: Unit; factor: number; barcode?: string | null; isOrderUnit?: boolean }[];
}

export async function listProducts(
  actor: Actor,
  f: { q?: string; categoryId?: string; supplierId?: string; status?: RecordStatus | "ALL"; page?: number; pageSize?: number } = {},
) {
  requirePermission(actor, "products.view");
  const where: P.ProductWhereInput = {
    ...(f.status === "ALL" ? {} : { status: f.status ?? "ACTIVE" }),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.supplierId ? { defaultSupplierId: f.supplierId } : {}),
    ...(f.q?.trim()
      ? {
          OR: [
            { name: { contains: f.q.trim(), mode: "insensitive" } },
            { nameAr: { contains: f.q.trim(), mode: "insensitive" } },
            { sku: { contains: f.q.trim(), mode: "insensitive" } },
            { barcode: f.q.trim() },
          ],
        }
      : {}),
  };
  const pageSize = Math.min(f.pageSize ?? 50, 200);
  const page = Math.max(1, f.page ?? 1);
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, nameAr: true } },
        supplier: { select: { id: true, name: true } },
        inventory: { where: branchWhere(actor), select: { quantity: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);
  return {
    rows: rows.map((p) => ({ ...p, totalQty: p.inventory.reduce((s, i) => s + num(i.quantity), 0) })),
    total,
    page,
    pageSize,
  };
}

export async function getProduct(actor: Actor, id: string) {
  requirePermission(actor, "products.view");
  const p = await db.product.findUnique({
    where: { id },
    include: {
      category: true,
      supplier: true,
      units: { orderBy: { factor: "asc" } },
      inventory: { where: branchWhere(actor), include: { branch: { select: { id: true, code: true, name: true, nameAr: true } } } },
    },
  });
  if (!p) throw notFound();
  return p;
}

function validate(i: ProductInput) {
  if (!/^[A-Za-z0-9-_.]{1,40}$/.test(i.sku)) throw new AppError("sku_invalid");
  if (!i.name.trim()) throw new AppError("name_required");
  if (!(i.costPrice >= 0)) throw new AppError("value_out_of_range");
  if (i.sellingPrice !== null && i.sellingPrice !== undefined && !(i.sellingPrice >= 0)) throw new AppError("value_out_of_range");
  const seen = new Set<Unit>([i.baseUnit]);
  for (const u of i.units) {
    if (seen.has(u.unit)) throw new AppError("unit_duplicate");
    seen.add(u.unit);
    if (!(u.factor > 0)) throw new AppError("factor_invalid");
  }
  if (i.units.filter((u) => u.isOrderUnit).length > 1) throw new AppError("one_order_unit");
}

export async function saveProduct(actor: Actor, id: string | null, i: ProductInput) {
  requirePermission(actor, "products.manage");
  validate(i);
  const data = {
    sku: i.sku.trim().toUpperCase(),
    barcode: i.barcode?.trim() || null,
    name: i.name.trim(),
    nameAr: i.nameAr?.trim() || null,
    description: i.description?.trim() || null,
    categoryId: i.categoryId || null,
    baseUnit: i.baseUnit,
    defaultSupplierId: i.defaultSupplierId || null,
    costPrice: i.costPrice,
    sellingPrice: i.sellingPrice ?? null,
    status: i.status,
    ...(i.imageId !== undefined ? { imageId: i.imageId || null } : {}),
  };
  try {
    return await db.$transaction(async (tx) => {
      if (!id) {
        const p = await tx.product.create({
          data: { ...data, units: { create: i.units.map((u) => ({ unit: u.unit, factor: u.factor, barcode: u.barcode || null, isOrderUnit: !!u.isOrderUnit })) } },
        });
        await audit(actor, { action: "product.create", entityType: "product", entityId: p.id, summary: p.sku, after: i }, tx);
        return p;
      }
      const before = await tx.product.findUnique({ where: { id }, include: { units: true } });
      if (!before) throw notFound();
      const p = await tx.product.update({ where: { id }, data });
      await tx.productUnit.deleteMany({ where: { productId: id } });
      await tx.productUnit.createMany({
        data: i.units.map((u) => ({ productId: id, unit: u.unit, factor: u.factor, barcode: u.barcode || null, isOrderUnit: !!u.isOrderUnit })),
      });
      const d = diff(
        { ...before, costPrice: num(before.costPrice), sellingPrice: before.sellingPrice === null ? null : num(before.sellingPrice) } as unknown as Record<string, unknown>,
        data as unknown as Record<string, unknown>,
      );
      const unitsBefore = before.units.map((u) => `${u.unit}:${num(u.factor)}`).sort().join(",");
      const unitsAfter = i.units.map((u) => `${u.unit}:${u.factor}`).sort().join(",");
      if (d.changed || unitsBefore !== unitsAfter) {
        await audit(actor, {
          action: "product.update",
          entityType: "product",
          entityId: id,
          summary: p.sku,
          before: { ...d.before, ...(unitsBefore !== unitsAfter ? { units: unitsBefore } : {}) },
          after: { ...d.after, ...(unitsBefore !== unitsAfter ? { units: unitsAfter } : {}) },
        }, tx);
      }
      return p;
    });
  } catch (e) {
    if (isUniqueViolation(e, "sku")) throw new AppError("sku_taken");
    if (isUniqueViolation(e, "barcode")) throw new AppError("barcode_taken");
    throw e;
  }
}

export async function listCategories() {
  return db.productCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } });
}

export async function saveCategory(actor: Actor, id: string | null, i: { name: string; nameAr?: string | null; parentId?: string | null }) {
  requirePermission(actor, "products.manage");
  if (!i.name.trim()) throw new AppError("name_required");
  if (id && i.parentId === id) throw new AppError("value_out_of_range");
  try {
    const data = { name: i.name.trim(), nameAr: i.nameAr?.trim() || null, parentId: i.parentId || null };
    const c = id ? await db.productCategory.update({ where: { id }, data }) : await db.productCategory.create({ data });
    await audit(actor, { action: id ? "category.update" : "category.create", entityType: "category", entityId: c.id, after: data });
    return c;
  } catch (e) {
    if (isUniqueViolation(e, "name")) throw new AppError("name_taken");
    throw e;
  }
}

export async function toggleFavorite(actor: Actor, productId: string) {
  const existing = await db.userFavoriteProduct.findUnique({ where: { userId_productId: { userId: actor.id, productId } } });
  if (existing) {
    await db.userFavoriteProduct.delete({ where: { userId_productId: { userId: actor.id, productId } } });
    return false;
  }
  await db.userFavoriteProduct.create({ data: { userId: actor.id, productId } });
  return true;
}
