"use client";
import { useEffect, useRef } from "react";
import { Printer } from "lucide-react";
import { btnClass } from "@/components/ui";

/** Opens the browser print dialog once on load (Save as PDF) and offers a manual button. */
export function PrintButton({ label, auto = true }: { label: string; auto?: boolean }) {
  const done = useRef(false);
  useEffect(() => {
    if (!auto || done.current) return;
    done.current = true;
    const h = setTimeout(() => window.print(), 400);
    return () => clearTimeout(h);
  }, [auto]);
  return (
    <button type="button" onClick={() => window.print()} className={btnClass("primary", "md", "no-print")}>
      <Printer className="size-4" /> {label}
    </button>
  );
}
