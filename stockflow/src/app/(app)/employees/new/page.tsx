import { requireActor } from "@/server/auth/current";
import { branchOptions } from "@/server/branches";
import { supplierOptions } from "@/server/admin-queries";
import { getT } from "@/i18n/server";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { bname } from "@/components/status";
import { NewUserForm } from "./form";

export const metadata = { title: "New user" };

export default async function NewUserPage() {
  const actor = await requireActor("users.manage");
  const { t, locale } = await getT();
  const branches = await branchOptions(actor);
  const suppliers = actor.role === "OWNER" ? await supplierOptions(actor) : [];
  const roles = actor.role === "OWNER" ? (["EMPLOYEE", "MANAGER", "SUPPLIER", "OWNER"] as const) : (["EMPLOYEE"] as const);
  return (
    <>
      <PageHeader title={t("users.newTitle")} back={{ href: "/employees", label: t("users.title") }} />
      <Card className="max-w-3xl">
        <CardBody>
          <NewUserForm roles={[...roles]} branches={branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))} suppliers={suppliers} />
        </CardBody>
      </Card>
    </>
  );
}
