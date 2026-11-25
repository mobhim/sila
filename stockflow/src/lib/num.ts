/** Client-safe numeric helpers. Server code passes plain numbers/strings to the UI. */

export type Numeric = number | string | { toString(): string } | null | undefined;

export function num(v: Numeric): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Round to 3 decimals (the precision of stored quantities). */
export function q3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
