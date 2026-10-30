"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { loginAction } from "@/server/actions/auth";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await loginAction({ ...values, next });
      // On success the action redirects; we only get here on failure.
      if (result && !result.ok) setError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" autoComplete="username" autoFocus placeholder="name@company.com" {...form.register("email")} />
          {form.formState.errors.email && <FieldError>{form.formState.errors.email.message}</FieldError>}
        </Field>
        <Field data-invalid={!!form.formState.errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
          {form.formState.errors.password && <FieldError>{form.formState.errors.password.message}</FieldError>}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
}
