"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ProductPicker } from "@/components/product-picker";
import { useI18n } from "@/i18n/client";

/** Picks a product and puts it in the URL (`param`, default productId). */
export function ProductFilter({ branchId, selectedLabel, param = "productId" }: { branchId?: string | null; selectedLabel?: string | null; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { t } = useI18n();
  const go = (id: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (id) next.set(param, id);
    else next.delete(param);
    next.delete("page");
    router.push(`${path}?${next.toString()}`);
  };
  if (selectedLabel) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm text-brand-800">
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <button type="button" onClick={() => go(null)} aria-label={t("transactions.clearProduct")} className="text-brand-600 hover:text-rose-600">
          <X className="size-4" />
        </button>
      </div>
    );
  }
  return <ProductPicker branchId={branchId} onPick={(p) => go(p.id)} placeholder={t("transactions.anyProduct")} />;
}
