import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { actorFromToken, SESSION_COOKIE } from "./session";
import { can, type Actor, type Permission } from "../rbac";

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

/** The signed-in actor for this request, or null. Cached per request. */
export const getActor = cache(async (): Promise<(Actor & { mustChangePassword: boolean }) | null> => {
  const jar = await cookies();
  const actor = await actorFromToken(jar.get(SESSION_COOKIE)?.value);
  if (!actor) return null;
  const meta = await requestMeta();
  return { ...actor, ...meta };
});

/** For pages: redirect to login when signed out, home when the permission is missing. */
export async function requireActor(perm?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.mustChangePassword) redirect("/change-password");
  if (perm && !can(actor, perm)) redirect(homeFor(actor));
  return actor;
}

export function homeFor(actor: Pick<Actor, "role">): string {
  switch (actor.role) {
    case "SUPPLIER":
      return "/supplier";
    case "EMPLOYEE":
      return "/record";
    default:
      return "/dashboard";
  }
}
