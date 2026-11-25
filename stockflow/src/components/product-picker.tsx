"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { RecordingProduct } from "@/server/inventory/queries";

export type PickerProduct = RecordingProduct;

/**
 * Search-as-you-type product picker backed by /api/products/search.
 * `branchId` decides whose stock is shown (ignored for employees: server uses their branch).
 */
export function ProductPicker({
  onPick, branchId, placeholder, autoFocus, exclude = [], className,
}: {
  onPick: (p: PickerProduct) => void;
  branchId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  exclude?: string[];
  className?: string;
}) {
  const { t, num, locale } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const h = setTimeout(async () => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ q });
        if (branchId) sp.set("branchId", branchId);
        const res = await fetch(`/api/products/search?${sp}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults((data.products ?? []).filter((p: PickerProduct) => !exclude.includes(p.id)));
        setActive(0);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(h);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, branchId, exclude.join(",")]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (p: PickerProduct) => {
    onPick(p);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={box} className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        className="input ps-9"
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t("common.search")}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); if (results[active]) pick(results[active]); }
          if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open ? (
        <ul role="listbox" className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {loading && !results.length ? <li className="px-3 py-2 text-sm text-slate-500">{t("common.loading")}</li> : null}
          {!loading && !results.length ? <li className="px-3 py-2 text-sm text-slate-500">{t("common.noResults")}</li> : null}
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm ${i === active ? "bg-brand-50" : "hover:bg-slate-50"}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{locale === "ar" ? p.nameAr || p.name : p.name}</span>
                  <span className="block truncate text-xs text-slate-500" dir="ltr">{p.sku}{p.barcode ? ` · ${p.barcode}` : ""}</span>
                </span>
                <span className="tnum shrink-0 text-xs text-slate-500">{num(p.available)} {t(`enums.unit.${p.baseUnit}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
