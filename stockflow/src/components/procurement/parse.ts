import { z } from "zod";

export const zItems = z.preprocess(
  (v) => {
    try {
      return JSON.parse(String(v ?? "[]"));
    } catch {
      return [];
    }
  },
  z.array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().finite(), unitCost: z.number().finite().min(0).optional() })).max(500),
);

/** Read `qty_<id>` fields into [{ itemId, quantity }]. */
export function qtyLines(fd: FormData): { itemId: string; quantity: number }[] {
  const out: { itemId: string; quantity: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("qty_")) continue;
    const n = Number(String(v).replace(/,/g, ""));
    if (String(v).trim() === "" || !Number.isFinite(n)) continue;
    out.push({ itemId: k.slice(4), quantity: n });
  }
  return out;
}

export function parseDay(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T12:00:00Z`);
}
