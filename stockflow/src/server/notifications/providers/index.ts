import type { Channel } from "@prisma/client";
import nodemailer, { type Transporter } from "nodemailer";

export interface OutboundMessage {
  to: string;
  title: string;
  body: string;
  link?: string | null;
}

export interface Provider {
  channel: Channel;
  name: string;
  configured(): boolean;
  /** Missing env vars, for the Settings page. */
  missing(): string[];
  send(m: OutboundMessage): Promise<{ id?: string }>;
}

const env = (k: string) => process.env[k]?.trim() || "";
const need = (...keys: string[]) => keys.filter((k) => !env(k));
const absolute = (link?: string | null) => (link ? `${env("APP_URL").replace(/\/$/, "")}${link}` : "");

// ── Email (SMTP) ──
let transport: Transporter | null = null;
export const emailProvider: Provider = {
  channel: "EMAIL",
  name: "SMTP",
  missing: () => need("SMTP_HOST", "SMTP_FROM"),
  configured() {
    return this.missing().length === 0;
  },
  async send(m) {
    transport ??= nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port: Number(env("SMTP_PORT") || 587),
      secure: env("SMTP_SECURE") === "true",
      auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: env("SMTP_PASSWORD") } : undefined,
    });
    const url = absolute(m.link);
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const info = await transport.sendMail({
      from: env("SMTP_FROM"),
      to: m.to,
      subject: m.title,
      text: `${m.body}${url ? `\n\n${url}` : ""}`,
      html: `<div dir="auto" style="font-family:system-ui,sans-serif;line-height:1.6"><h2 style="margin:0 0 8px">${esc(m.title)}</h2><p>${esc(m.body)}</p>${url ? `<p><a href="${esc(url)}">${esc(url)}</a></p>` : ""}</div>`,
    });
    return { id: info.messageId };
  },
};

// ── WhatsApp Business Cloud API (template message) ──
export const whatsappProvider: Provider = {
  channel: "WHATSAPP",
  name: "WhatsApp Cloud API",
  missing: () => need("WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE"),
  configured() {
    return this.missing().length === 0;
  },
  async send(m) {
    const version = env("WHATSAPP_API_VERSION") || "v21.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: m.to.replace(/[^\d]/g, ""),
        type: "template",
        template: {
          name: env("WHATSAPP_TEMPLATE"),
          language: { code: env("WHATSAPP_TEMPLATE_LANG") || "ar" },
          components: [{ type: "body", parameters: [{ type: "text", text: m.title.slice(0, 200) }, { type: "text", text: m.body.slice(0, 900) }] }],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${data.error?.message ?? "request failed"}`);
    return { id: data.messages?.[0]?.id };
  },
};

// ── SMS: Twilio or Unifonic ──
export const smsProvider: Provider = {
  channel: "SMS",
  get name() {
    return env("SMS_PROVIDER") === "unifonic" ? "Unifonic" : "Twilio";
  },
  missing() {
    if (env("SMS_PROVIDER") === "unifonic") return need("UNIFONIC_APP_SID", "UNIFONIC_SENDER_ID");
    if (env("SMS_PROVIDER") === "twilio") return need("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM");
    return ["SMS_PROVIDER"];
  },
  configured() {
    return this.missing().length === 0;
  },
  async send(m) {
    const text = `${m.title}\n${m.body}`.slice(0, 600);
    if (env("SMS_PROVIDER") === "unifonic") {
      const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ AppSid: env("UNIFONIC_APP_SID"), SenderID: env("UNIFONIC_SENDER_ID"), Recipient: m.to.replace(/[^\d]/g, ""), Body: text }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean | string; message?: string; data?: { MessageID?: string } };
      if (!res.ok || String(data.success) !== "true") throw new Error(`Unifonic: ${data.message ?? res.status}`);
      return { id: data.data?.MessageID };
    }
    const sid = env("TWILIO_ACCOUNT_SID");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: env("TWILIO_FROM"), To: m.to, Body: text }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message ?? "request failed"}`);
    return { id: data.sid };
  },
};

export const PROVIDERS: Partial<Record<Channel, Provider>> = {
  EMAIL: emailProvider,
  WHATSAPP: whatsappProvider,
  SMS: smsProvider,
};

export function channelStatus() {
  return (["EMAIL", "WHATSAPP", "SMS"] as const).map((c) => {
    const p = PROVIDERS[c]!;
    return { channel: c, provider: p.name, configured: p.configured(), missing: p.missing() };
  });
}
