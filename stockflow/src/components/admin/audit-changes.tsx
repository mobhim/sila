import { getT } from "@/i18n/server";

type J = unknown;

function show(v: J): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Expandable before → after view of an audit record (server component). */
export async function AuditChanges({ before, after }: { before: J; after: J }) {
  const { t } = await getT();
  const b = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, J>;
  const a = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, J>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (!keys.length) return <span className="text-xs text-slate-400">{t("audit.noChanges")}</span>;
  return (
    <details className="group text-xs">
      <summary className="cursor-pointer select-none text-brand-700 hover:underline">{keys.length} · {keys.slice(0, 3).join(", ")}{keys.length > 3 ? "…" : ""}</summary>
      <table className="mt-2 w-full border-collapse" dir="ltr">
        <thead>
          <tr className="text-slate-500"><th className="py-1 pe-2 text-start font-medium">key</th><th className="py-1 pe-2 text-start font-medium">{t("audit.before")}</th><th className="py-1 text-start font-medium">{t("audit.after")}</th></tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-slate-100 align-top">
              <td className="py-1 pe-2 font-mono text-slate-600">{k}</td>
              <td className="max-w-[16rem] break-words py-1 pe-2 font-mono text-rose-700">{k in b ? show(b[k]) : ""}</td>
              <td className="max-w-[16rem] break-words py-1 font-mono text-emerald-700">{k in a ? show(a[k]) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
