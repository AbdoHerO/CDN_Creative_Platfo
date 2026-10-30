"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, KeyRound, MoreHorizontal, Pencil, UserCheck, UserPlus, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { RoleKey } from "@/generated/prisma/enums";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { createUserAction, resetUserPasswordAction, setUserStatusAction, updateUserAction } from "@/server/actions/users";

type App = { id: string; name: string; brandColor: string };
export type TeamUser = {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  role: RoleKey;
  status: "ACTIVE" | "DISABLED";
  restrictApplications: boolean;
  applicationIds: string[];
};

const schema = z
  .object({
    name: z.string().trim().min(2, "Name is required.").max(100),
    email: z.string().trim().email("Enter a valid email."),
    jobTitle: z.string().max(100),
    role: z.enum(RoleKey),
    restrictApplications: z.boolean(),
    applicationIds: z.array(z.string()),
  })
  .refine((v) => !v.restrictApplications || v.applicationIds.length > 0, { path: ["applicationIds"], message: "Select at least one application." });
type Values = z.infer<typeof schema>;

function TemporaryPassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>
            Share this password with {email} through a secure channel. It is shown only once; the user must choose a new password at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
          <code className="flex-1 font-mono text-base tracking-wide" data-testid="temporary-password">
            {password}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              toast.success("Copied to clipboard.");
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserFormDialog({ user, applications }: { user?: TeamUser; applications: App[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const defaults: Values = {
    name: user?.name ?? "",
    email: user?.email ?? "",
    jobTitle: user?.jobTitle ?? "",
    role: user?.role ?? "CREATOR",
    restrictApplications: user?.restrictApplications ?? false,
    applicationIds: user?.applicationIds ?? [],
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const errors = form.formState.errors;
  const restrict = useWatch({ control: form.control, name: "restrictApplications" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const payload = { ...values, jobTitle: values.jobTitle || null };
      const res = user ? await updateUserAction(user.id, payload) : await createUserAction(payload);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: m });
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!user && typeof res.data === "object" && res.data && "temporaryPassword" in res.data) {
        setCreated({ email: res.data.email, temporaryPassword: res.data.temporaryPassword });
      }
      router.refresh();
    }),
  );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) form.reset(defaults);
        }}
      >
        <DialogTrigger asChild>
          {user ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${user.name}`}>
              <Pencil />
            </Button>
          ) : (
            <Button>
              <UserPlus /> Add user
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <DialogHeader>
              <DialogTitle>{user ? `Edit ${user.name}` : "Add a team member"}</DialogTitle>
              <DialogDescription>
                {user ? "Change role and application access. Role changes sign the user out." : "A temporary password is generated and shown once."}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.name}>
                  <FieldLabel htmlFor="user-name">Full name</FieldLabel>
                  <Input id="user-name" {...form.register("name")} />
                  {errors.name && <FieldError>{errors.name.message}</FieldError>}
                </Field>
                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="user-email">Email</FieldLabel>
                  <Input id="user-email" type="email" disabled={!!user} {...form.register("email")} />
                  {errors.email && <FieldError>{errors.email.message}</FieldError>}
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="user-title">Job title</FieldLabel>
                <Input id="user-title" placeholder="Optional" {...form.register("jobTitle")} />
              </Field>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2 sm:grid-cols-2">
                      {(Object.keys(ROLE_LABELS) as RoleKey[]).map((r) => (
                        <label
                          key={r}
                          className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/40"
                        >
                          <RadioGroupItem value={r} className="mt-0.5" />
                          <span>
                            <span className="block font-medium">{ROLE_LABELS[r]}</span>
                            <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                />
              </Field>
              <Field data-invalid={!!errors.applicationIds}>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="restrict-apps">Restrict to specific applications</FieldLabel>
                  <Controller
                    control={form.control}
                    name="restrictApplications"
                    render={({ field }) => <Switch id="restrict-apps" checked={field.value} onCheckedChange={field.onChange} />}
                  />
                </div>
                {restrict ? (
                  <Controller
                    control={form.control}
                    name="applicationIds"
                    render={({ field }) => (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {applications.map((a) => (
                          <label key={a.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <Checkbox
                              checked={field.value.includes(a.id)}
                              onCheckedChange={(v) => field.onChange(v === true ? [...field.value, a.id] : field.value.filter((x) => x !== a.id))}
                            />
                            <span className="size-2 rounded-full" style={{ backgroundColor: a.brandColor }} />
                            {a.name}
                          </label>
                        ))}
                      </div>
                    )}
                  />
                ) : (
                  <FieldDescription>The user can access every application.</FieldDescription>
                )}
                {errors.applicationIds && <FieldError>{errors.applicationIds.message}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />}
                {user ? "Save changes" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {created && <TemporaryPassword email={created.email} password={created.temporaryPassword} onClose={() => setCreated(null)} />}
    </>
  );
}

export function UserRowActions({ user, isSelf }: { user: TeamUser; isSelf: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"status" | "reset" | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; temporaryPassword: string } | null>(null);
  if (isSelf) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirm("reset")}>
            <KeyRound /> Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.status === "ACTIVE" ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("status")}>
              <UserX /> Disable account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("status")}>
              <UserCheck /> Re-enable account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "status"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={user.status === "ACTIVE" ? `Disable ${user.name}?` : `Re-enable ${user.name}?`}
        description={user.status === "ACTIVE" ? "The user is signed out immediately and can no longer sign in. Their creatives and history are kept." : "The user can sign in again."}
        confirmLabel={user.status === "ACTIVE" ? "Disable" : "Re-enable"}
        destructive={user.status === "ACTIVE"}
        onConfirm={async () => {
          const res = await setUserStatusAction(user.id, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(res.message);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Reset ${user.name}'s password?`}
        description="A new temporary password is generated, all of the user's sessions are signed out, and they must choose a new password at next sign-in."
        confirmLabel="Reset password"
        onConfirm={async () => {
          const res = await resetUserPasswordAction(user.id);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          setRevealed(res.data);
        }}
      />
      {revealed && <TemporaryPassword email={revealed.email} password={revealed.temporaryPassword} onClose={() => setRevealed(null)} />}
    </>
  );
}
