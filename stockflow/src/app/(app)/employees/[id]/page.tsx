import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { getUser } from "@/server/users";
import { branchOptions } from "@/server/branches";
import { supplierOptions } from "@/server/admin-queries";
import { can } from "@/server/rbac";
import { AppError } from "@/server/errors";
import { getFmt } from "@/i18n/server";
import { Badge, Card, CardBody, CardHeader, DescList, PageHeader } from "@/components/ui";
import { bname } from "@/components/status";
import { EditUser, ResetUser } from "./form";

export const metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("users.view");
  const { id } = await params;
  const f = await getFmt();
  const { t, locale } = f;
  let user;
  try {
    user = await getUser(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const canManage = can(actor, "users.manage");
  const branches = await branchOptions(actor);
  const suppliers = actor.role === "OWNER" ? await supplierOptions(actor) : [];
  const roles = actor.role === "OWNER" ? (["EMPLOYEE", "MANAGER", "SUPPLIER", "OWNER"] as const) : (["EMPLOYEE"] as const);
  const primary = user.branches.find((b) => b.isPrimary)?.branchId ?? user.branches[0]?.branchId ?? null;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{user.name}<Badge tone={user.status === "ACTIVE" ? "green" : "gray"}>{t(`enums.userStatus.${user.status}`)}</Badge></span>}
        description={<span dir="ltr">{user.email}</span>}
        back={{ href: "/employees", label: t("users.title") }}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={canManage ? t("users.edit") : t("common.details")} />
          <CardBody>
            {canManage ? (
              <EditUser
                isSelf={user.id === actor.id}
                roles={[...roles]}
                branches={branches.map((b) => ({ id: b.id, label: `${bname(b, locale)} · ${b.code}` }))}
                suppliers={suppliers}
                defaults={{
                  id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status, locale: user.locale,
                  supplierId: user.supplierId, branchIds: user.branches.map((b) => b.branchId), primaryBranchId: primary,
                }}
              />
            ) : (
              <DescList items={[
                { label: t("common.role"), value: t(`enums.role.${user.role}`) },
                { label: t("common.phone"), value: user.phone ?? "—" },
              ]} />
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DescList className="sm:grid-cols-1" items={[
                { label: t("common.role"), value: t(`enums.role.${user.role}`) },
                { label: t("users.lastLogin"), value: user.lastLoginAt ? f.dateTime(user.lastLoginAt) : t("users.never") },
                { label: t("common.createdAt"), value: f.date(user.createdAt) },
              ]} />
            </CardBody>
          </Card>
          {canManage && user.id !== actor.id ? (
            <Card>
              <CardHeader title={t("users.resetPassword")} />
              <CardBody><ResetUser userId={user.id} /></CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
