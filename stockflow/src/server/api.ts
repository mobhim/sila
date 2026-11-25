import "server-only";
import { NextResponse } from "next/server";
import { getActor } from "./auth/current";
import { AppError } from "./errors";
import type { Actor } from "./rbac";
import { makeT, type Locale } from "@/i18n";

/** Route-handler wrapper: auth + uniform JSON errors. */
export async function api(fn: (actor: Actor) => Promise<Response | unknown>) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await fn(actor);
    return r instanceof Response ? r : NextResponse.json(r);
  } catch (e) {
    const t = makeT((actor.locale as Locale) ?? "ar");
    if (e instanceof AppError) return NextResponse.json({ error: t(`errors.${e.code}`, e.params), code: e.code }, { status: e.status });
    console.error("[api]", e);
    return NextResponse.json({ error: t("errors.unexpected") }, { status: 500 });
  }
}
