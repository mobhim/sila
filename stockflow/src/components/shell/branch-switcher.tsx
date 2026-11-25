"use client";
import { useTransition } from "react";
import { setBranchAction } from "@/app/actions";

export function BranchSwitcher({ branches, value, allLabel, label }: { branches: { id: string; label: string }[]; value: string; allLabel: string | null; label: string }) {
  const [pending, start] = useTransition();
  return (
    <form action={setBranchAction} className="min-w-0">
      <label className="sr-only" htmlFor="branch-switch">{label}</label>
      <select
        id="branch-switch"
        name="branch"
        defaultValue={value}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("branch", e.target.value);
          start(() => setBranchAction(fd));
        }}
        className="input h-9 max-w-[11rem] py-1 pe-8 text-sm font-medium sm:max-w-[16rem]"
      >
        {allLabel ? <option value="all">{allLabel}</option> : null}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.label}</option>
        ))}
      </select>
    </form>
  );
}
