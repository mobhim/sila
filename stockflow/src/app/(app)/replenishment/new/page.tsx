import { requireActor } from "@/server/auth/current";
import { branchOptions } from "@/server/branches";
import { supplierOptions } from "@/server/procurement-queries";
import { getSelectedBranch } from "@/server/branch-selection";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
import { bname } from "@/components/status";
import { NewRequestForm } from "./form";

export const metadata = { title: "New replenishment" };

export default async function NewReplenishmentPage() {
  const actor = await requireActor("replenishment.manage");
  const [branches, suppliers, selected] = await Promise.all([branchOptions(actor), supplierOptions(actor), getSelectedBranch(actor)]);
  const { t, locale } = await getT();
  return (
    <>
      <PageHeader title={t("replenishment.newTitle")} description={t("replenishment.newHint")} back={{ href: "/replenishment", label: t("replenishment.title") }} />
      <NewRequestForm
        branches={branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))}
        suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.name} · ${s.code}` }))}
        defaultBranch={selected ?? branches[0]?.id ?? ""}
      />
    </>
  );
}
