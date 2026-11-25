/**
 * Errors thrown by business logic. `code` is an i18n key under "errors.*" so the UI can
 * show a translated message; `params` fill placeholders in it.
 */
export class AppError extends Error {
  constructor(
    public code: string,
    public params: Record<string, string | number> = {},
    public status = 400,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export const notFound = () => new AppError("not_found", {}, 404);
export const forbidden = () => new AppError("forbidden", {}, 403);

export function isUniqueViolation(e: unknown, field?: string): boolean {
  const err = e as { code?: string; meta?: { target?: string[] | string } };
  if (err?.code !== "P2002") return false;
  if (!field) return true;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.some((x) => x.includes(field)) : String(t ?? "").includes(field);
}
