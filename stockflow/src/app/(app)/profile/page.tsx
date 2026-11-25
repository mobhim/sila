import { requireActor } from "@/server/auth/current";
import { getProfile } from "@/server/admin-queries";
import { getFmt } from "@/i18n/server";
import { ButtonLink, Card, CardBody, CardHeader, DescList, PageHeader } from "@/components/ui";
import { bname } from "@/components/status";
import { ProfileForm } from "./form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const actor = await requireActor();
  const f = await getFmt();
  const { t, locale } = f;
  const p = await getProfile(actor);
  return (
    <>
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("profile.account")} />
          <CardBody>
            <ProfileForm v={{ name: p.name, phone: p.phone, locale: p.locale, notifyEmail: p.notifyEmail, notifyWhatsapp: p.notifyWhatsapp, notifySms: p.notifySms }} />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DescList className="sm:grid-cols-1" items={[
                { label: t("common.email"), value: <span dir="ltr">{p.email}</span> },
                { label: t("common.role"), value: t(`enums.role.${p.role}`) },
                { label: t("profile.branches"), value: p.role === "OWNER" ? t("common.allBranches") : p.branches.length ? p.branches.map((b) => `${bname(b.branch, locale)} (${b.branch.code})`).join("، ") : "—" },
                ...(p.supplier ? [{ label: t("common.supplier"), value: p.supplier.name }] : []),
                { label: t("profile.lastLogin"), value: f.dateTime(p.lastLoginAt) },
              ]} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("profile.security")} />
            <CardBody><ButtonLink href="/change-password" variant="secondary">{t("profile.changePassword")}</ButtonLink></CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
