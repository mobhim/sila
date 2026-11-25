"use client";
import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { useI18n } from "@/i18n/client";

/**
 * Uploads a file to /api/uploads and exposes the attachment id in a hidden input
 * named `name` (default "attachmentId") so the surrounding form submits it.
 */
export function FileUpload({ name = "attachmentId", accept = "image/*,application/pdf", imagesOnly, capture, label, onUploaded }: {
  name?: string; accept?: string; imagesOnly?: boolean; capture?: boolean; label?: string; onUploaded?: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ id: string; fileName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(f: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", f);
      if (imagesOnly) fd.set("imagesOnly", "1");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "upload failed");
      setFile({ id: data.id, fileName: data.fileName });
      onUploaded?.(data.id);
    } catch (e) {
      setError((e as Error).message);
      onUploaded?.(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={file?.id ?? ""} />
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <Paperclip className="size-4 text-slate-400" />
          <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
          <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => { setFile(null); onUploaded?.(null); }} aria-label={t("common.remove")}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-brand-400 hover:bg-brand-50/40 ${busy ? "opacity-60" : ""}`}>
          <Paperclip className="size-4 text-slate-400" />
          {busy ? t("common.loading") : label ?? t("common.upload")}
          <input ref={input} type="file" accept={accept} capture={capture ? "environment" : undefined} className="sr-only" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        </label>
      )}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

export function AttachmentLink({ id, fileName }: { id: string; fileName: string }) {
  return (
    <a href={`/api/files/${id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
      <Paperclip className="size-3.5" /> {fileName}
    </a>
  );
}
