import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reveals nothing beyond DB reachability. */
export async function GET() {
  let ok = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    ok = false;
  }
  return NextResponse.json({ ok, db: ok, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
