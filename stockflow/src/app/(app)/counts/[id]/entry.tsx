"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { Checkbox } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { saveCountsAction } from "../actions";

export interface CountLine {
  itemId: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  costPrice: number;
  systemQty: number | null; // null when hidden (blind) or not counted
  currentQty: number | null; // null when hidden
  countedQty: number | null;
  reason: string | null;
}

type Draft = { counted: string; reason: string };

export function CountEntry({ countId, lines, editable, blind }: { countId: string; lines: CountLine[]; editable: boolean; blind: boolean }) {
  const { t, num, money } = useI18n();
  const [q, setQ] = useState("");
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [onlyVariance, setOnlyVariance] = useState(false);
  const [dirty, setDirty] = useState<Record<string, Draft>>({});

  const value = (l: CountLine): Draft => dirty[l.itemId] ?? { counted: l.countedQty === null ? "" : String(l.countedQty), reason: l.reason ?? "" };
  const variance = (l: CountLine) => {
    if (blind || l.systemQty === null || dirty[l.itemId]) {
      // Unsaved edits: show variance against the current quantity (the snapshot is taken on save).
      const base = dirty[l.itemId] ? l.currentQty : l.systemQty;
      const c = value(l).counted;
      if (blind || base === null || c === "" || Number.isNaN(Number(c))) return null;
      return Math.round((Number(c) - base) * 1000) / 1000;
    }
    return l.countedQty === null ? null : Math.round((l.countedQty - l.systemQty) * 1000) / 1000;
  };

  const counted = lines.filter((l) => value(l).counted !== "").length;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (term && !(l.name.toLowerCase().includes(term) || l.sku.toLowerCase().includes(term) || l.barcode === q.trim())) return false;
      if (onlyUncounted && value(l).counted !== "") return false;
      if (onlyVariance && !variance(l)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, q, onlyUncounted, onlyVariance, dirty]);

  const entries = Object.entries(dirty).map(([itemId, d]) => ({
    itemId,
    countedQty: d.counted.trim() === "" ? null : Number(d.counted),
    reason: d.reason.trim() || null,
  }));
  const invalid = entries.some((e) => e.countedQty !== null && (Number.isNaN(e.countedQty) || e.countedQty < 0));

  const set = (l: CountLine, patch: Partial<Draft>) => setDirty((d) => ({ ...d, [l.itemId]: { ...value(l), ...patch } }));

  return (
    <ActionForm action={saveCountsAction} onSuccess={() => setDirty({})}>
      <input type="hidden" name="countId" value={countId} />
      <input type="hidden" name="entries" value={JSON.stringify(entries)} />
      <div className="sticky top-14 z-20 -mx-4 space-y-3 border-b border-slate-200 bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-slate-700">{t("counts.progress", { counted: num(counted), total: num(lines.length) })}</span>
          {editable ? (
            <SubmitButton size="sm" disabled={!entries.length || invalid}>{t("counts.saveCounts")}{entries.length ? ` (${entries.length})` : ""}</SubmitButton>
          ) : null}
        </div>
        <div className="h-1.5 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${lines.length ? (counted / lines.length) * 100 : 0}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("counts.filterLines")} className="input ps-9" />
          </div>
          <Checkbox label={t("counts.onlyUncounted")} checked={onlyUncounted} onChange={(e) => setOnlyUncounted(e.target.checked)} />
          {!blind ? <Checkbox label={t("counts.onlyVariance")} checked={onlyVariance} onChange={(e) => setOnlyVariance(e.target.checked)} /> : null}
        </div>
        {blind ? <p className="text-xs text-slate-500">{t("counts.blindHint")}</p> : null}
      </div>

      <ul className="mt-3 space-y-2">
        {shown.map((l) => {
          const v = value(l);
          const varc = variance(l);
          const isDirty = !!dirty[l.itemId];
          return (
            <li key={l.itemId} className={cn("card px-4 py-3", varc ? "border-amber-300 bg-amber-50/40" : "", isDirty ? "ring-1 ring-brand-300" : "")}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">{l.name}</p>
                  <p className="text-xs text-slate-500" dir="ltr">{l.sku}{l.barcode ? ` · ${l.barcode}` : ""}</p>
                  {!blind ? (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{t("counts.system")}: <b className="tnum text-slate-700">{l.systemQty === null ? "—" : num(l.systemQty)}</b></span>
                      <span>{t("counts.current")}: <b className="tnum text-slate-700">{l.currentQty === null ? "—" : num(l.currentQty)}</b></span>
                      {varc !== null ? (
                        <span className={varc === 0 ? "text-emerald-700" : varc > 0 ? "text-sky-700" : "text-rose-700"}>
                          {t("counts.variance")}: <b className="tnum">{varc > 0 ? "+" : ""}{num(varc)}</b> ({money(varc * l.costPrice)})
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <input
                    type="number" inputMode="decimal" min={0} step="any"
                    aria-label={`${t("counts.counted")} — ${l.name}`}
                    className="input tnum w-28 text-center text-base"
                    value={v.counted}
                    disabled={!editable}
                    placeholder={t("counts.notCounted")}
                    onChange={(e) => set(l, { counted: e.target.value })}
                  />
                  <span className="text-xs text-slate-500">{t(`enums.unit.${l.unit}`)}</span>
                </div>
              </div>
              {(editable && (varc || v.reason)) || (!editable && v.reason) ? (
                <input
                  type="text" maxLength={300} className="input mt-2" placeholder={t("counts.reasonPlaceholder")}
                  value={v.reason} disabled={!editable} onChange={(e) => set(l, { reason: e.target.value })}
                  aria-label={`${t("common.reason")} — ${l.name}`}
                />
              ) : null}
            </li>
          );
        })}
        {!shown.length ? <li className="card px-4 py-8 text-center text-sm text-slate-500">{t("common.noResults")}</li> : null}
      </ul>
    </ActionForm>
  );
}
