"use client";
import { UserForm, type UserDefaults } from "@/components/admin/user-form";
import { ResetPassword } from "@/components/admin/reset-password";
import { resetPasswordAction, updateUserAction } from "../actions";

type Role = "OWNER" | "MANAGER" | "EMPLOYEE" | "SUPPLIER";

export function EditUser(p: { roles: Role[]; branches: { id: string; label: string }[]; suppliers: { id: string; name: string }[]; defaults: UserDefaults; isSelf: boolean }) {
  return <UserForm action={updateUserAction} {...p} />;
}

export function ResetUser({ userId }: { userId: string }) {
  return <ResetPassword action={resetPasswordAction} userId={userId} />;
}
