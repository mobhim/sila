import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getActor } from "./auth/current";
import { AppError } from "./errors";
import { can, type Actor, type Permission } from "./rbac";
import { makeT, type Locale } from "@/i18n";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Wrap a server action: authenticate, optionally check a permission, run, translate
 * errors to the user's language, and revalidate paths on success.
 */
export async function act<T>(
  fn: (actor: Actor) => Promise<T>,
  opts: { perm?: Permission; revalidate?: string[]; success?: string } = {},
): Promise<ActionResult<T>> {
  const actor = await getActor();
  const t = makeT((actor?.locale as Locale) ?? "ar");
  if (!actor) return { ok: false, error: t("errors.forbidden") };
  if (opts.perm && !can(actor, opts.perm)) return { ok: false, error: t("errors.forbidden") };
  try {
    const data = await fn(actor);
    for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
    return { ok: true, data, message: opts.success ? t(opts.success) : undefined };
  } catch (e) {
    return toResult(e, t);
  }
}

export function toResult(e: unknown, t: ReturnType<typeof makeT>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (e instanceof AppError) return { ok: false, error: t(`errors.${e.code}`, e.params) };
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const k = issue.path.join(".");
      if (!fieldErrors[k]) fieldErrors[k] = issue.message.startsWith("errors.") ? t(issue.message) : t("errors.validation");
    }
    return { ok: false, error: t("errors.validation"), fieldErrors };
  }
  // Next.js redirect / notFound must propagate.
  const digest = (e as { digest?: string })?.digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_HTTP_ERROR"))) throw e;
  console.error("[action]", e);
  return { ok: false, error: t("errors.unexpected") };
}
