import { requireActor } from "@/server/auth/current";
import { getSettings } from "@/server/settings";
import { recentDeliveries } from "@/server/admin-queries";
import { channelStatus } from "@/server/notifications/providers";
import { storageStatus } from "@/server/storage";
import { getFmt } from "@/i18n/server";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { DeliveryBadge } from "@/components/status";
import { RequeueButton, SettingsForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor("settings.manage");
  const f = await getFmt();
  const { t } = f;
  const [s, deliveries] = await Promise.all([getSettings(), recentDeliveries(actor)]);
  const channels = channelStatus();
  const storage = storageStatus();
  const enabled = { EMAIL: s.emailEnabled, WHATSAPP: s.whatsappEnabled, SMS: s.smsEnabled } as const;

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <SettingsForm v={{
          businessName: s.businessName, vatNumber: s.vatNumber, allowNegativeStock: s.allowNegativeStock, criticalPercent: s.criticalPercent,
          consumptionWindowDays: s.consumptionWindowDays, safetyDays: s.safetyDays, autoDraftReplenishment: s.autoDraftReplenishment,
          autoApproveReplenishment: s.autoApproveReplenishment, showHijri: s.showHijri, emailEnabled: s.emailEnabled, whatsappEnabled: s.whatsappEnabled, smsEnabled: s.smsEnabled,
        }} />
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("settings.channels")} description={t("settings.channelsHint")} />
            <ul className="divide-y divide-slate-100">
              <li className="flex items-center justify-between px-4 py-3 sm:px-5 text-sm">
                <span>{t("enums.channel.IN_APP")}</span><Badge tone="green">{t("settings.configured")}</Badge>
              </li>
              {channels.map((c) => (
                <li key={c.channel} className="space-y-2 px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{t(`enums.channel.${c.channel}`)} <span className="text-xs text-slate-400">· {c.provider}</span></span>
                    <span className="flex gap-1.5">
                      {!enabled[c.channel] ? <Badge tone="gray">{t("common.inactive")}</Badge> : null}
                      {c.configured ? <Badge tone="green">{t("settings.configured")}</Badge> : <Badge tone="amber">{t("settings.requiresSetup")}</Badge>}
                    </span>
                  </div>
                  {!c.configured ? <p className="text-xs text-slate-500" dir="ltr">{t("settings.missing", { vars: c.missing.join(", ") })}</p> : (
                    <div>
                      <RequeueButton channel={c.channel} />
                      <p className="mt-1 text-xs text-slate-500">{t("settings.requeueHint")}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t("settings.storage")} />
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>{t("settings.driver")}: <span className="font-mono" dir="ltr">{storage.driver}</span></span>
                {storage.configured ? <Badge tone="green">{t("settings.configured")}</Badge> : <Badge tone="amber">{t("settings.requiresSetup")}</Badge>}</div>
              {!storage.configured ? <p className="text-xs text-slate-500" dir="ltr">{t("settings.missing", { vars: storage.missing.join(", ") })}</p> : null}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title={t("settings.deliveries")} />
        {deliveries.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>{t("common.date")}</th><th>{t("settings.channel")}</th><th>{t("settings.recipient")}</th><th>{t("nav.notifications")}</th><th>{t("common.status")}</th><th className="text-end">{t("settings.attempts")}</th><th>{t("settings.error")}</th></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap text-slate-600">{f.dateTime(d.createdAt)}</td>
                    <td>{t(`enums.channel.${d.channel}`)}</td>
                    <td className="text-slate-600">{d.notification.user.name}<div className="text-xs text-slate-400" dir="ltr">{d.destination}</div></td>
                    <td className="max-w-xs truncate">{d.notification.title}</td>
                    <td><DeliveryBadge status={d.status} t={t} /></td>
                    <td className="tnum text-end">{d.attempts}</td>
                    <td className="max-w-xs truncate text-xs text-slate-500" title={d.lastError ?? ""} dir="ltr">{d.lastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <CardBody><p className="text-sm text-slate-500">{t("settings.noDeliveries")}</p></CardBody>}
      </Card>
    </>
  );
}
