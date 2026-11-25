"use client";
import { SupplierForm, type SupplierDefaults } from "@/components/admin/supplier-form";
import { saveSupplierAction } from "./actions";

export function SupplierEditor({ defaults }: { defaults?: SupplierDefaults }) {
  return <SupplierForm action={saveSupplierAction} defaults={defaults} />;
}
