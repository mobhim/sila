"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { useI18n } from "@/i18n/client";

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => DetectorLike;
  }
}

/**
 * Camera barcode scanner. Uses the native BarcodeDetector when present (Chrome/Android),
 * otherwise ZXing (iOS Safari, Firefox). Calls onDetected once per scan.
 */
export function BarcodeScanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let zxingStop: (() => void) | null = null;
    let raf = 0;
    let done = false;
    const hit = (code: string) => {
      if (done || !code) return;
      done = true;
      if (navigator.vibrate) navigator.vibrate(60);
      onDetected(code.trim());
    };

    (async () => {
      setError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
          if (cancelled) return;
          const v = video.current!;
          v.srcObject = stream;
          await v.play();
          const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] });
          const tick = async () => {
            if (cancelled || done) return;
            try {
              const codes = await det.detect(v);
              if (codes[0]?.rawValue) return hit(codes[0].rawValue);
            } catch {
              /* frame not ready */
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current!, (result) => {
            if (result) hit(result.getText());
          });
          zxingStop = () => controls.stop();
          if (cancelled) zxingStop();
        }
      } catch (e) {
        const name = (e as Error).name;
        setError(name === "NotAllowedError" ? t("record.cameraDenied") : t("record.cameraUnavailable"));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      zxingStop?.();
    };
  }, [open, onDetected, t]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={t("record.scan")}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="flex items-center gap-2 text-sm font-medium"><Camera className="size-4" /> {t("record.scanHint")}</span>
        <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label={t("common.close")}><X className="size-5" /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} className="absolute inset-0 size-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-40 -translate-y-1/2 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        {error ? <p className="absolute inset-x-4 top-4 rounded-lg bg-rose-600 px-3 py-2 text-sm text-white">{error}</p> : null}
      </div>
      <form
        className="flex gap-2 bg-black p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onDetected(manual.trim());
        }}
      >
        <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" dir="ltr" placeholder={t("record.typeCode")} className="input flex-1" />
        <button type="submit" className="rounded-lg bg-white px-4 text-sm font-medium text-slate-900">{t("common.confirm")}</button>
      </form>
    </div>
  );
}
