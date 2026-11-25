"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { burnPasswordCheck, verifyPassword } from "@/server/auth/password";
import { clearRateLimit, rateLimit } from "@/server/auth/rate-limit";
import { createSession, destroySession, SESSION_COOKIE } from "@/server/auth/session";
import { getActor, homeFor, requestMeta } from "@/server/auth/current";
import { BRANCH_COOKIE } from "@/server/branch-selection";
import { LOCALE_COOKIE } from "@/i18n/server";
import { makeT, type Locale } from "@/i18n";
import { changeOwnPassword } from "@/server/users";
import { act, type ActionResult } from "@/server/action";
import { loadActor } from "@/server/auth/session";

const secure = process.env.NODE_ENV === "production";

async function currentLocale(): Promise<Locale> {
  return (await cookies()).get(LOCALE_COOKIE)?.value === "en" ? "en" : "ar";
}

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const t = makeT(await currentLocale());
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) }).safeParse({
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parsed.success) return { ok: false, error: t("errors.login_failed") };
  const { email, password } = parsed.data;
  const { ip, userAgent } = await requestMeta();

  const okEmail = await rateLimit(`login:${email}`, 5, 15 * 60);
  const okIp = await rateLimit(`login-ip:${ip ?? "unknown"}`, 30, 15 * 60);
  if (!okEmail || !okIp) return { ok: false, error: t("errors.login_locked") };

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await burnPasswordCheck(password);
    return { ok: false, error: t("errors.login_failed") };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid || user.status !== "ACTIVE") {
    await db.auditLog.create({ data: { userId: user.id, action: "auth.login_failed", entityType: "user", entityId: user.id, ip, userAgent: userAgent?.slice(0, 300) } });
    return { ok: false, error: t("errors.login_failed") };
  }
  await clearRateLimit(`login:${email}`);
  const { token, maxAge } = await createSession(user.id, ip, userAgent);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 31536000, sameSite: "lax", secure });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const actor = await loadActor(user.id);
  await audit(actor ? { ...actor, ip, userAgent } : null, { action: "auth.login", entityType: "user", entityId: user.id });
  const next = String(fd.get("next") ?? "");
  redirect(user.mustChangePassword ? "/change-password" : next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user));
}

export async function logoutAction() {
  const jar = await cookies();
  const actor = await getActor();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  jar.delete(BRANCH_COOKIE);
  if (actor) await audit(actor, { action: "auth.logout", entityType: "user", entityId: actor.id });
  redirect("/login");
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const next = String(fd.get("next") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const res = await act(async (actor) => {
    if (next !== confirm) {
      const { AppError } = await import("@/server/errors");
      throw new AppError("password_mismatch");
    }
    await changeOwnPassword(actor, String(fd.get("current") ?? ""), next, (await cookies()).get(SESSION_COOKIE)?.value);
    return homeFor(actor);
  });
  if (res.ok) redirect(res.data as string);
  return res;
}

export async function setLocaleAction(fd: FormData) {
  const locale: Locale = fd.get("locale") === "en" ? "en" : "ar";
  const actor = await getActor();
  if (actor) await db.user.update({ where: { id: actor.id }, data: { locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 31536000, sameSite: "lax", secure });
  revalidatePath("/", "layout");
}

export async function setBranchAction(fd: FormData) {
  const v = String(fd.get("branch") ?? "all");
  (await cookies()).set(BRANCH_COOKIE, v, { path: "/", maxAge: 31536000, sameSite: "lax", secure, httpOnly: true });
  revalidatePath("/", "layout");
}
