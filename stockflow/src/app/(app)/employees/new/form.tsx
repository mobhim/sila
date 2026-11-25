"use client";
import { UserForm } from "@/components/admin/user-form";
import { createUserAction } from "../actions";

type Role = "OWNER" | "MANAGER" | "EMPLOYEE" | "SUPPLIER";

export function NewUserForm(p: { roles: Role[]; branches: { id: string; label: string }[]; suppliers: { id: string; name: string }[] }) {
  return <UserForm action={createUserAction} created {...p} />;
}
