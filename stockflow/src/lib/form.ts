import { z } from "zod";

/** Zod helpers for FormData fields (strings in, typed values out). */
export const zStr = (max = 200) => z.string().trim().max(max);
export const zReq = (max = 200) => z.string().trim().min(1, "errors.name_required").max(max);
export const zOpt = (max = 500) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());
export const zNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? NaN : Number(String(v).replace(/,/g, ""))), z.number({ message: "errors.quantity_invalid" }).finite("errors.quantity_invalid"));
export const zNumOpt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/,/g, ""))), z.number().finite().nullable());
export const zInt = z.preprocess((v) => Number(v), z.number().int());
export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1", z.boolean());
export const zId = z.string().min(1).max(64);
export const zIdOpt = z.preprocess((v) => (v === "" ? null : v), z.string().max(64).nullable().optional());

export function formObject(fd: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const o: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      o[key] = [...((o[key] as FormDataEntryValue[]) ?? []), v];
    } else o[k] = v;
  }
  return o;
}
