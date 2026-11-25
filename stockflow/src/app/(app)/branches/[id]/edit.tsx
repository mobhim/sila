"use client";
import { BranchForm, type BranchDefaults } from "@/components/admin/branch-form";
import { updateBranchAction } from "../actions";

export function BranchEdit({ defaults, managers }: { defaults: BranchDefaults; managers: { id: string; name: string }[] }) {
  return <BranchForm action={updateBranchAction} defaults={defaults} managers={managers} />;
}
