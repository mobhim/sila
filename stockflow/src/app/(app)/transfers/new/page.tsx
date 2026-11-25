import { requireActor } from "@/server/auth/current";
import { allBranchOptions } from "@/server/branches";
import { branchScope } from "@/server/rbac";
import { getSelectedBranch } from "@/server/branch-selection";
import { getT } from "@/i18n/server";
import { PageHeader } from "@/components/ui";
import { bname } from "@/components/status";
import { NewTransferForm } from "./form";

export const metadata = { title: "New transfer" };

export default async function NewTransferPage() {
  const actor = await requireActor("transfers.manage");
  const branches = await allBranchOptions(actor);
  const scope = branchScope(actor);
  const mine = scope === "ALL" ? branches.map((b) => b.id) : scope;
  const selected = await getSelectedBranch(actor);
  const { t, locale } = await getT();
  const opts = branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}`, mine: mine.includes(b.id) }));
  const defSource = selected && mine.includes(selected) ? selected : opts.find((o) => o.mine)?.id ?? "";
  return (
    <>
      <PageHeader title={t("transfers.newTitle")} description={t("transfers.newHint")} back={{ href: "/transfers", label: t("transfers.title") }} />
      <NewTransferForm branches={opts} defaultSource={defSource} />
    </>
  );
}
