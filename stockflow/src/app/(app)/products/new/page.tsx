import { requireActor } from "@/server/auth/current";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "@/components/inventory/product-form";
import { saveProductAction } from "../actions";
import { productFormOptions } from "../form-data";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const actor = await requireActor("products.manage");
  const { t, locale } = await getT();
  const opts = await productFormOptions(actor, locale);
  return (
    <>
      <PageHeader title={t("products.newTitle")} back={{ href: "/products", label: t("products.title") }} />
      <ProductForm
        action={saveProductAction}
        cancelHref="/products"
        {...opts}
        values={{ sku: "", barcode: "", name: "", nameAr: "", description: "", categoryId: "", baseUnit: "PIECE", defaultSupplierId: "", costPrice: "0", sellingPrice: "", status: "ACTIVE", imageId: null, units: [] }}
      />
    </>
  );
}
