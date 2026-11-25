import { requireActor } from "@/server/auth/current";
import { getT } from "@/i18n/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { SupplierEditor } from "../form";

export const metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requireActor("suppliers.manage");
  const { t } = await getT();
  return (
    <>
      <PageHeader title={t("suppliers.newTitle")} back={{ href: "/suppliers", label: t("suppliers.title") }} />
      <Card className="max-w-3xl"><CardBody><SupplierEditor /></CardBody></Card>
    </>
  );
}
