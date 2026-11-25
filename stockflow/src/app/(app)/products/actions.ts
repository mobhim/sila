"use server";
import { z } from "zod";
import { Unit, RecordStatus } from "@prisma/client";
import { act } from "@/server/action";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { saveCategory, saveProduct } from "@/server/products";
import { updateThresholds } from "@/server/inventory/queries";
import { formObject, zBool, zId, zIdOpt, zNum, zNumOpt, zOpt, zReq } from "@/lib/form";

const unitRow = z.object({
  unit: z.nativeEnum(Unit),
  factor: z.coerce.number().positive("errors.factor_invalid"),
  barcode: z.string().trim().max(64).nullable().optional(),
  isOrderUnit: z.boolean().optional(),
});

const productSchema = z.object({
  id: zIdOpt,
  sku: zReq(40),
  barcode: zOpt(64),
  name: zReq(200),
  nameAr: zOpt(200),
  description: zOpt(2000),
  categoryId: zIdOpt,
  baseUnit: z.nativeEnum(Unit),
  defaultSupplierId: zIdOpt,
  costPrice: zNum.refine((v) => v >= 0, "errors.value_out_of_range"),
  sellingPrice: zNumOpt,
  status: z.nativeEnum(RecordStatus),
  imageId: zIdOpt,
  currentImageId: zIdOpt,
  removeImage: zBool,
  units: z.string().max(10000).default("[]"),
});

export async function saveProductAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const v = productSchema.parse(formObject(fd));
      let units: z.infer<typeof unitRow>[];
      try {
        units = z.array(unitRow).max(10).parse(JSON.parse(v.units));
      } catch {
        throw new AppError("factor_invalid");
      }
      let imageId: string | null | undefined = v.currentImageId ?? null;
      if (v.removeImage) imageId = null;
      if (v.imageId) {
        const att = await db.attachment.findUnique({ where: { id: v.imageId } });
        if (!att || att.uploadedById !== actor.id || !att.mimeType.startsWith("image/")) throw new AppError("file_type_not_allowed");
        imageId = v.imageId;
      }
      const p = await saveProduct(actor, v.id ?? null, {
        sku: v.sku,
        barcode: v.barcode ?? null,
        name: v.name,
        nameAr: v.nameAr ?? null,
        description: v.description ?? null,
        categoryId: v.categoryId ?? null,
        baseUnit: v.baseUnit,
        defaultSupplierId: v.defaultSupplierId ?? null,
        costPrice: v.costPrice,
        sellingPrice: v.sellingPrice,
        status: v.status,
        imageId,
        units: units.map((u) => ({ ...u, barcode: u.barcode || null })),
      });
      return { id: p.id };
    },
    { perm: "products.manage", revalidate: ["/products", "/inventory"], success: "products.productSaved" },
  );
}

export async function saveCategoryAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const v = z.object({ id: zIdOpt, name: zReq(100), nameAr: zOpt(100), parentId: zIdOpt }).parse(formObject(fd));
      await saveCategory(actor, v.id ?? null, { name: v.name, nameAr: v.nameAr ?? null, parentId: v.parentId ?? null });
    },
    { perm: "products.manage", revalidate: ["/products"], success: "common.saved" },
  );
}

const nonNeg = zNum.refine((v) => v >= 0, "errors.quantity_invalid");

export async function updateThresholdsAction(_prev: unknown, fd: FormData) {
  return act(
    async (actor) => {
      const v = z
        .object({
          branchId: zId,
          productId: zId,
          minStock: nonNeg,
          criticalStock: zNumOpt,
          reorderQty: nonNeg,
          maxStock: nonNeg,
          safetyStock: nonNeg,
        })
        .parse(formObject(fd));
      await updateThresholds(actor, v.branchId, v.productId, {
        minStock: v.minStock,
        criticalStock: v.criticalStock,
        reorderQty: v.reorderQty,
        maxStock: v.maxStock,
        safetyStock: v.safetyStock,
      });
    },
    { perm: "inventory.thresholds", revalidate: ["/products", "/inventory", "/alerts"], success: "products.thresholdsSaved" },
  );
}
