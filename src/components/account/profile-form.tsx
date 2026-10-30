"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { updateProfileAction } from "@/server/actions/preferences";

export function ProfileForm({ name, jobTitle, email }: { name: string; jobTitle: string | null; email: string }) {
  const router = useRouter();
  const [values, setValues] = useState({ name, jobTitle: jobTitle ?? "" });
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateProfileAction(values);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message);
          router.refresh();
        });
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-name">Full name</FieldLabel>
            <Input id="profile-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required minLength={2} maxLength={100} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-title">Job title</FieldLabel>
            <Input id="profile-title" value={values.jobTitle} onChange={(e) => setValues((v) => ({ ...v, jobTitle: e.target.value }))} maxLength={100} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="profile-email">Email</FieldLabel>
          <Input id="profile-email" value={email} disabled />
        </Field>
        <div>
          <Button type="submit" disabled={pending || values.name.trim().length < 2}>
            {pending && <Spinner />}
            Save profile
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
