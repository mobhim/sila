"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Minus, Plus, ScanLine, Star, TriangleAlert, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/cn";
import { Alert, btnClass } from "@/components/ui";
import { ProductPicker, type PickerProduct } from "@/components/product-picker";
import { BarcodeScanner } from "@/components/scanner";
import { FileUpload } from "@/components/file-upload";
import { recordAction, reportProblemAction, toggleFavoriteAction } from "./actions";

type Mode = "record" | "problem";
interface Done {
  seq: number;
  type: string;
  quantity: number;
  unit: string;
  newQty: number;
  baseUnit: string;
  productName: string;
  replayed: boolean;
}

const QUICK = [1, 2, 5, 10];

export function RecordScreen({
  branchId, branches, branchLabel, types, initialType, favorites, recent,
}: {
  branchId: string;
  branches: { id: string; label: string }[];
  branchLabel: string | null;
  types: string[];
  initialType: string;
  favorites: PickerProduct[];
  recent: PickerProduct[];
}) {
  const { t, num, locale } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("record");
  const [type, setType] = useState(initialType);
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [unit, setUnit] = useState<string>("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState("DAMAGED");
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [problemDone, setProblemDone] = useState<string | null>(null);
  const [favIds, setFavIds] = useState(() => new Set(favorites.map((f) => f.id)));
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => setKey(crypto.randomUUID()), []);

  const name = (p: PickerProduct) => (locale === "ar" ? p.nameAr || p.name : p.name);
  const factor = product ? (unit === product.baseUnit ? 1 : product.units.find((u) => u.unit === unit)?.factor ?? 1) : 1;
  const q = Number(qty.replace(",", "."));
  const baseQty = Number.isFinite(q) ? q * factor : 0;
  const outflow = ["CONSUMPTION", "WITHDRAWAL"].includes(type) || mode === "problem";
  const insufficient = !!product && outflow && baseQty > product.available;

  const choose = useCallback((p: PickerProduct, u?: string) => {
    setProduct(p);
    setUnit(u ?? p.baseUnit);
    setQty("");
    setError(null);
    setDone(null);
    setProblemDone(null);
    setTimeout(() => qtyRef.current?.focus(), 50);
  }, []);

  const onScan = useCallback(async (code: string) => {
    setScanning(false);
    setError(null);
    const sp = new URLSearchParams({ code, branchId });
    const res = await fetch(`/api/products/barcode?${sp}`);
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    if (!data.match) return setError(t("record.notFoundCode", { code }));
    choose(data.match.product, data.match.unit);
  }, [branchId, choose, t]);

  function reset(keepType = true) {
    setProduct(null);
    setQty("");
    setReason("");
    setNotes("");
    setAttachmentId(null);
    setMore(false);
    setConfirming(false);
    if (!keepType) setType(initialType);
    setKey(crypto.randomUUID());
  }

  function submit() {
    if (!product || !(q > 0)) return;
    const fd = new FormData();
    fd.set("branchId", branchId);
    fd.set("productId", product.id);
    fd.set("quantity", String(q));
    fd.set("idempotencyKey", key);
    if (reason) fd.set("reason", reason);
    if (notes) fd.set("notes", notes);
    if (attachmentId) fd.set("attachmentId", attachmentId);
    start(async () => {
      setError(null);
      if (mode === "record") {
        fd.set("type", type);
        fd.set("unit", unit);
        const res = await recordAction(null, fd);
        if (!res.ok) {
          setError(res.error);
          setConfirming(false);
          return;
        }
        setDone(res.data as Done);
      } else {
        if (factor !== 1) fd.set("quantity", String(baseQty));
        fd.set("kind", kind);
        const res = await reportProblemAction(null, fd);
        if (!res.ok) {
          setError(res.error);
          setConfirming(false);
          return;
        }
        const d = res.data as { autoApproved: boolean };
        setProblemDone(d.autoApproved ? t("record.problemPosted") : t("record.problemSent"));
      }
      reset();
      router.refresh();
    });
  }

  async function toggleFav(p: PickerProduct) {
    const res = await toggleFavoriteAction(p.id);
    if (res.ok) {
      setFavIds((s) => {
        const n = new Set(s);
        if (res.data) n.add(p.id);
        else n.delete(p.id);
        return n;
      });
    }
  }

  const unitLabel = (u: string) => t(`enums.unit.${u}`);
  const typeLabel = (x: string) => t(`enums.tx.${x}`);

  return (
    <div className="space-y-4">
      {/* Branch context */}
      {branches.length > 1 ? (
        <select
          className="input"
          value={branchId}
          onChange={(e) => router.push(`/record?branch=${e.target.value}&type=${type}`)}
          aria-label={t("common.branch")}
        >
          {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
      ) : branchLabel ? (
        <p className="text-xs text-slate-500">{t("common.branch")}: <span className="font-medium text-slate-700">{branchLabel}</span></p>
      ) : null}

      {/* Mode switch */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1 text-sm font-medium">
        {(["record", "problem"] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(null); setConfirming(false); }}
            className={cn("rounded-lg py-2", mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>
            {m === "record" ? t("record.modeRecord") : t("record.modeProblem")}
          </button>
        ))}
      </div>

      {done ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900" role="status">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{done.replayed ? t("record.alreadyRecorded") : t("record.success")} <span className="font-mono text-xs" dir="ltr">TX-{done.seq}</span></p>
            <p className="mt-0.5">{typeLabel(done.type)} · {num(done.quantity)} {unitLabel(done.unit)} · {done.productName}</p>
            <p className="mt-0.5 text-emerald-700">{t("record.newBalance", { qty: num(done.newQty), unit: unitLabel(done.baseUnit) })}</p>
          </div>
          <button type="button" onClick={() => setDone(null)} className="text-emerald-700" aria-label={t("common.close")}><X className="size-4" /></button>
        </div>
      ) : null}
      {problemDone ? <Alert tone="success">{problemDone}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {/* Movement type */}
      {mode === "record" ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("common.type")}>
          {types.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={type === x} onClick={() => setType(x)}
              className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", type === x ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700")}>
              {typeLabel(x)}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {["DAMAGED", "EXPIRED", "MISSING"].map((x) => (
            <button key={x} type="button" role="radio" aria-checked={kind === x} onClick={() => setKind(x)}
              className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", kind === x ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white text-slate-700")}>
              {t(`enums.adjustmentKind.${x}`)}
            </button>
          ))}
        </div>
      )}

      {/* Product selection */}
      {!product ? (
        <div className="card space-y-4 p-4">
          <div className="flex gap-2">
            <ProductPicker className="flex-1" branchId={branchId} onPick={(p) => choose(p)} placeholder={t("record.searchPlaceholder")} />
            <button type="button" onClick={() => setScanning(true)} className={btnClass("primary", "md", "shrink-0 px-3")} aria-label={t("record.scan")}>
              <ScanLine className="size-5" /> <span className="hidden sm:inline">{t("record.scan")}</span>
            </button>
          </div>
          {favorites.length || favIds.size ? <QuickList title={t("record.favorites")} items={[...favorites, ...recent].filter((p, i, a) => favIds.has(p.id) && a.findIndex((x) => x.id === p.id) === i)} onPick={choose} name={name} /> : null}
          {recent.length ? <QuickList title={t("record.recent")} items={recent} onPick={choose} name={name} /> : null}
          {!recent.length && !favorites.length ? <p className="text-center text-xs text-slate-500">{t("record.hintEmpty")}</p> : null}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-start gap-3 border-b border-slate-100 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-slate-900">{name(product)}</p>
              <p className="text-xs text-slate-500" dir="ltr">{product.sku}{product.barcode ? ` · ${product.barcode}` : ""}</p>
              <p className={cn("mt-1 text-sm", product.available <= 0 ? "text-rose-600" : "text-slate-600")}>
                {t("record.available")}: <span className="tnum font-semibold">{num(product.available)}</span> {unitLabel(product.baseUnit)}
              </p>
            </div>
            <button type="button" onClick={() => toggleFav(product)} className="grid size-9 place-items-center rounded-lg hover:bg-slate-100" aria-label={t("record.favorite")} aria-pressed={favIds.has(product.id)}>
              <Star className={cn("size-5", favIds.has(product.id) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
            </button>
            <button type="button" onClick={() => reset()} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label={t("record.change")}>
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-4 p-4">
            {product.units.length ? (
              <div className="flex flex-wrap gap-2">
                {[{ unit: product.baseUnit, factor: 1 }, ...product.units].map((u) => (
                  <button key={u.unit} type="button" onClick={() => setUnit(u.unit)}
                    className={cn("rounded-lg border px-3 py-1.5 text-sm", unit === u.unit ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-slate-300 text-slate-600")}>
                    {unitLabel(u.unit)}{u.factor !== 1 ? <span className="ms-1 text-xs text-slate-500">({num(u.factor)} {unitLabel(product.baseUnit)})</span> : null}
                  </button>
                ))}
              </div>
            ) : null}

            <div>
              <label htmlFor="qty" className="label">{t("common.quantity")} ({unitLabel(unit)})</label>
              <div className="flex items-stretch gap-2">
                <button type="button" className={btnClass("secondary", "lg", "w-12 px-0")} onClick={() => setQty(String(Math.max(0, (q || 0) - 1)))} aria-label="-"><Minus className="size-5" /></button>
                <input ref={qtyRef} id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.,٠-٩]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))))}
                  onKeyDown={(e) => { if (e.key === "Enter" && q > 0) { e.preventDefault(); setConfirming(true); } }}
                  className="input h-12 flex-1 text-center text-xl font-semibold tnum" placeholder="0" dir="ltr" autoComplete="off" />
                <button type="button" className={btnClass("secondary", "lg", "w-12 px-0")} onClick={() => setQty(String((q || 0) + 1))} aria-label="+"><Plus className="size-5" /></button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {QUICK.map((n) => (
                  <button key={n} type="button" onClick={() => setQty(String(n))} className="rounded-lg border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 tnum">{num(n)}</button>
                ))}
              </div>
              {factor !== 1 && q > 0 ? <p className="mt-2 text-xs text-slate-500">= {num(baseQty)} {unitLabel(product.baseUnit)}</p> : null}
              {insufficient ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-700"><TriangleAlert className="size-3.5" /> {t("record.overAvailable")}</p>
              ) : null}
            </div>

            {mode === "problem" ? (
              <>
                <div>
                  <label className="label" htmlFor="reason">{t("common.reason")} *</label>
                  <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("record.problemReasonPh")} />
                </div>
                <FileUpload imagesOnly capture accept="image/*" label={t("record.addPhoto")} onUploaded={setAttachmentId} name="_unused" />
              </>
            ) : (
              <div>
                <button type="button" className="text-xs font-medium text-brand-700" onClick={() => setMore((m) => !m)}>{more ? "−" : "+"} {t("record.addNote")}</button>
                {more ? (
                  <div className="mt-2 space-y-2">
                    <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("common.reason")} />
                    <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder={t("common.notes")} />
                  </div>
                ) : null}
              </div>
            )}

            <button type="button" disabled={!(q > 0) || pending || (mode === "problem" && !reason.trim())} onClick={() => setConfirming(true)}
              className={btnClass(mode === "problem" ? "danger" : "primary", "lg", "w-full")}>
              {mode === "problem" ? t("record.reviewProblem") : t("record.review")}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation sheet */}
      {confirming && product ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" role="dialog" aria-modal="true" onClick={() => !pending && setConfirming(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t("record.confirmTitle")}</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {mode === "record" ? typeLabel(type) : t(`enums.adjustmentKind.${kind}`)} · {num(q)} {unitLabel(unit)}
            </p>
            <p className="text-sm text-slate-600">{name(product)}</p>
            {mode === "record" ? (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 tnum">
                {t("record.balanceChange", { from: num(product.available), to: num(product.available + (outflow ? -baseQty : baseQty)), unit: unitLabel(product.baseUnit) })}
              </p>
            ) : (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t("record.problemNeedsApproval")}</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" className={btnClass("secondary", "lg")} onClick={() => setConfirming(false)} disabled={pending}>{t("common.back")}</button>
              <button type="button" className={btnClass(mode === "problem" ? "danger" : "primary", "lg")} onClick={submit} disabled={pending} autoFocus>
                {pending ? t("common.saving") : t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onScan} />
    </div>
  );
}

function QuickList({ title, items, onPick, name }: { title: string; items: PickerProduct[]; onPick: (p: PickerProduct) => void; name: (p: PickerProduct) => string }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-start text-sm hover:border-brand-400 hover:bg-brand-50/40">
            <span className="line-clamp-2 font-medium text-slate-800">{name(p)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
