"use client";
import { BranchForm } from "@/components/admin/branch-form";
import { createBranchAction } from "../actions";

export function BranchFormNew({ managers }: { managers: { id: string; name: string }[] }) {
  return <BranchForm action={createBranchAction} managers={managers} redirectTo={(id) => `/branches/${id}`} />;
}
