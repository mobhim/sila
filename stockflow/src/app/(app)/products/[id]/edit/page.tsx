import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { getProduct } from "@/server/products";
import { AppError } from "@/server/errors";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/inventory/product-form";
import { pname } from "@/components/status";
import { saveProductAction } from "../../actions";
import { productFormOptions } from "../../form-data";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("products.manage");
  const { id } = await params;
  const { t, locale } = await getT();
  const p = await getProduct(actor, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const opts = await productFormOptions(actor, locale);
  return (
    <>
      <PageHeader title={t("products.editTitle")} description={pname(p, locale)} back={{ href: `/products/${id}`, label: pname(p, locale) }} />
      <ProductForm
        action={saveProductAction}
        cancelHref={`/products/${id}`}
        {...opts}
        values={{
          id: p.id,
          sku: p.sku,
          barcode: p.barcode ?? "",
          name: p.name,
          nameAr: p.nameAr ?? "",
          description: p.description ?? "",
          categoryId: p.categoryId ?? "",
          baseUnit: p.baseUnit,
          defaultSupplierId: p.defaultSupplierId ?? "",
          costPrice: String(Number(p.costPrice)),
          sellingPrice: p.sellingPrice === null ? "" : String(Number(p.sellingPrice)),
          status: p.status,
          imageId: p.imageId,
          units: p.units.map((u) => ({ unit: u.unit, factor: String(Number(u.factor)), barcode: u.barcode ?? "", isOrderUnit: u.isOrderUnit })),
        }}
      />
    </>
  );
}
