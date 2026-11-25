import { requireActor } from "@/server/auth/current";
import { managerOptions } from "@/server/admin-queries";
import { getT } from "@/i18n/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { BranchFormNew } from "./form";

export const metadata = { title: "New branch" };

export default async function NewBranchPage() {
  const actor = await requireActor("branches.manage");
  const { t } = await getT();
  const managers = await managerOptions(actor);
  return (
    <>
      <PageHeader title={t("branches.newTitle")} back={{ href: "/branches", label: t("branches.title") }} />
      <Card className="max-w-3xl">
        <CardBody>
          <BranchFormNew managers={managers} />
        </CardBody>
      </Card>
    </>
  );
}
