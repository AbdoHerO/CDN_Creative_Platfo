"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { changePasswordAction } from "@/server/actions/auth";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters.")
      .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Use a mix of letters and numbers."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

type Values = z.infer<typeof schema>;

export function ChangePasswordForm({ redirectTo, submitLabel = "Update password" }: { redirectTo?: string; submitLabel?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await changePasswordAction(values);
      if (!result.ok) {
        for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
          form.setError(key as keyof Values, { message });
        }
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Password updated.");
      form.reset();
      if (redirectTo) router.replace(redirectTo);
      else router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.currentPassword}>
          <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
          <Input id="currentPassword" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
          {errors.currentPassword && <FieldError>{errors.currentPassword.message}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.newPassword}>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <Input id="newPassword" type="password" autoComplete="new-password" {...form.register("newPassword")} />
          {errors.newPassword ? (
            <FieldError>{errors.newPassword.message}</FieldError>
          ) : (
            <FieldDescription>At least 10 characters, with letters and numbers.</FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
          <Input id="confirmPassword" type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
          {errors.confirmPassword && <FieldError>{errors.confirmPassword.message}</FieldError>}
        </Field>
        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            {submitLabel}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
