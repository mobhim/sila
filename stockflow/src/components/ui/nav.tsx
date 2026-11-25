import Link from "next/link";
import { cn } from "@/lib/cn";

/** Build a URL with updated search params (server-side helper). */
export function withParams(path: string, current: Record<string, string | string[] | undefined>, patch: Record<string, string | number | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (typeof v === "string" && v !== "") sp.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

export function Pagination({ path, params, page, pageSize, total, labels }: {
  path: string; params: Record<string, string | string[] | undefined>; page: number; pageSize: number; total: number;
  labels: { prev: string; next: string; summary: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const link = "inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50";
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500" aria-label="pagination">
      <span>{labels.summary}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className={link} href={withParams(path, params, { page: page - 1 })}>{labels.prev}</Link> : <span className={cn(link, "opacity-40")}>{labels.prev}</span>}
        {page < pages ? <Link className={link} href={withParams(path, params, { page: page + 1 })}>{labels.next}</Link> : <span className={cn(link, "opacity-40")}>{labels.next}</span>}
      </div>
    </nav>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: React.ReactNode; href: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className={cn(
            "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            it.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
          )}
          aria-current={it.key === active ? "page" : undefined}
        >
          {it.label}
          {it.count !== undefined ? <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{it.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Timeline({ items }: { items: { id: string; title: React.ReactNode; meta: React.ReactNode; note?: string | null }[] }) {
  return (
    <ol className="relative space-y-4 border-s border-slate-200 ps-5">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className="absolute -start-[25px] top-1 size-2.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
          <p className="text-sm font-medium text-slate-800">{it.title}</p>
          <p className="text-xs text-slate-500">{it.meta}</p>
          {it.note ? <p className="mt-1 whitespace-pre-line rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{it.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
