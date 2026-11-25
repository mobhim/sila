import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/server/notifications/dispatcher";

export const dynamic = "force-dynamic";

function authorized(req: Request, secret: string) {
  const header = req.headers.get("authorization") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduled dispatcher for email / WhatsApp / SMS deliveries (e.g. Vercel Cron every 5 min). */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(req, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stats = await dispatchNotifications(100);
  return NextResponse.json({ ok: true, ...stats, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
