import { requireActor } from "@/server/auth/current";
import { branchOptions } from "@/server/branches";
import { listCategories } from "@/server/products";
import { getSelectedBranch } from "@/server/branch-selection";
import { getT } from "@/i18n/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { bname } from "@/components/status";
import { NewCountForm } from "./form";

export const metadata = { title: "New count" };

export default async function NewCountPage() {
  const actor = await requireActor("counts.manage");
  const { t, locale } = await getT();
  const [branches, categories, selected] = await Promise.all([branchOptions(actor), listCategories(), getSelectedBranch(actor)]);
  return (
    <>
      <PageHeader title={t("counts.newTitle")} description={t("counts.newDescription")} back={{ href: "/counts", label: t("counts.title") }} />
      <Card className="max-w-2xl">
        <CardBody>
          <NewCountForm
            branches={branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))}
            categories={categories.map((c) => ({ id: c.id, label: bname(c, locale) }))}
            defaultBranch={selected ?? branches[0]?.id ?? ""}
          />
        </CardBody>
      </Card>
    </>
  );
}
