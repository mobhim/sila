"use client";
import { Printer } from "lucide-react";
import { btnClass } from "@/components/ui";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className={btnClass("primary")} onClick={() => window.print()}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
