import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {user.mustChangePassword ? "Set a new password" : "Change password"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {user.mustChangePassword
            ? "Your account uses a temporary password. Choose a personal password to continue."
            : "Choose a new password for your account."}
        </p>
      </div>
      <ChangePasswordForm redirectTo="/dashboard" submitLabel="Save and continue" />
    </div>
  );
}
