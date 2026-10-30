import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BrandMark className="lg:hidden" />
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-sm text-muted-foreground">Use your company account to access the creative library.</p>
      </div>
      <LoginForm next={next} />
      <p className="text-xs text-muted-foreground">
        No account yet? Ask a platform administrator to invite you.
      </p>
    </div>
  );
}
