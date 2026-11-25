import { requireActor } from "@/server/auth/current";
import { listCategories } from "@/server/products";
import { getT } from "@/i18n/server";
import { Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { pname } from "@/components/status";
import { saveCategoryAction } from "../actions";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireActor("products.manage");
  const { t, locale } = await getT();
  const cats = await listCategories();
  const parentLabel = (id: string | null) => {
    const c = cats.find((x) => x.id === id);
    return c ? pname(c, locale) : null;
  };
  return (
    <>
      <PageHeader title={t("products.categoriesTitle")} description={t("products.categoriesHint")} back={{ href: "/products", label: t("products.title") }} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("products.categories")} />
          {cats.length ? (
            <ul className="divide-y divide-slate-100">
              {cats.map((c) => (
                <li key={c.id} className="px-4 py-3 sm:px-5">
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">{pname(c, locale)}</span>
                        {parentLabel(c.parentId) ? <span className="ms-2 text-xs text-slate-400">↳ {parentLabel(c.parentId)}</span> : null}
                        <span className="block text-xs text-slate-500">{t("products.col.products")}: {c._count.products}</span>
                      </span>
                      <span className="text-xs font-medium text-brand-700">{t("products.rename")}</span>
                    </summary>
                    <CategoryForm id={c.id} name={c.name} nameAr={c.nameAr ?? ""} parentId={c.parentId ?? ""} options={cats.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, label: pname(x, locale) }))} t={t} />
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t("products.noCategories")} />
          )}
        </Card>
        <Card>
          <CardHeader title={t("products.newCategory")} />
          <CardBody>
            <CategoryForm name="" nameAr="" parentId="" options={cats.map((x) => ({ id: x.id, label: pname(x, locale) }))} t={t} reset />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function CategoryForm({ id, name, nameAr, parentId, options, t, reset }: { id?: string; name: string; nameAr: string; parentId: string; options: { id: string; label: string }[]; t: (k: string) => string; reset?: boolean }) {
  return (
    <ActionForm action={saveCategoryAction} resetOnSuccess={reset} className="mt-3 space-y-3">
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <Field label={t("products.categoryName")} required><Input name="name" defaultValue={name} required maxLength={100} dir="ltr" /></Field>
      <Field label={t("products.categoryNameAr")}><Input name="nameAr" defaultValue={nameAr} maxLength={100} dir="rtl" /></Field>
      <Field label={t("products.parentCategory")}>
        <Select name="parentId" defaultValue={parentId}>
          <option value="">—</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </Field>
      <SubmitButton size="sm">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}
