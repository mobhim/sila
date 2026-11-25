import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db";
import { getSelectedBranch } from "@/server/branch-selection";
import { branchOptions, defaultBranchFor } from "@/server/branches";
import { allowedTypes } from "@/server/movements";
import { productForRecording } from "@/server/inventory/queries";
import { getT } from "@/i18n/server";
import { EmptyState, PageHeader } from "@/components/ui";
import { RecordScreen } from "./record-screen";
import { bname } from "@/components/status";

export const metadata = { title: "Record" };

export default async function RecordPage({ searchParams }: { searchParams: Promise<{ type?: string; branch?: string }> }) {
  const actor = await requireActor("movements.record");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const selected = await getSelectedBranch(actor);
  let branchId: string;
  try {
    branchId = await defaultBranchFor(actor, sp.branch || selected);
  } catch {
    return <EmptyState title={t("errors.no_branch_assigned")} />;
  }
  const branches = actor.role === "EMPLOYEE" ? [] : await branchOptions(actor);

  const include = { units: true, inventory: { where: { branchId } } } as const;
  const [favorites, recentIds] = await Promise.all([
    db.userFavoriteProduct.findMany({ where: { userId: actor.id, product: { status: "ACTIVE" } }, include: { product: { include } }, orderBy: { createdAt: "asc" }, take: 12 }),
    db.$queryRaw<{ product_id: string }[]>`
      SELECT product_id FROM inventory_transactions WHERE user_id = ${actor.id} AND branch_id = ${branchId}
      GROUP BY product_id ORDER BY MAX(created_at) DESC LIMIT 8`,
  ]);
  const recentProducts = recentIds.length
    ? await db.product.findMany({ where: { id: { in: recentIds.map((r) => r.product_id) }, status: "ACTIVE" }, include })
    : [];
  const recent = recentIds.map((r) => recentProducts.find((p) => p.id === r.product_id)).filter(Boolean).map((p) => productForRecording(p!));
  const types = allowedTypes(actor);
  const initialType = types.includes(sp.type as never) ? sp.type! : "CONSUMPTION";
  const branch = branches.find((b) => b.id === branchId);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t("record.title")} description={t("record.subtitle")} />
      <RecordScreen
        key={branchId}
        branchId={branchId}
        branches={branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))}
        branchLabel={branch ? `${bname(branch, locale)} · ${branch.code}` : null}
        types={types}
        initialType={initialType}
        favorites={favorites.map((f) => productForRecording(f.product))}
        recent={recent}
      />
    </div>
  );
}
