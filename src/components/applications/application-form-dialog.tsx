"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createApplicationAction, updateApplicationAction } from "@/server/actions/applications";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80),
  description: z.string().max(1000),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563EB."),
});
type Values = z.infer<typeof schema>;

export function ApplicationFormDialog({ application }: { application?: { id: string; name: string; description: string | null; brandColor: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: Values = {
    name: application?.name ?? "",
    description: application?.description ?? "",
    brandColor: application?.brandColor ?? "#4F46E5",
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const errors = form.formState.errors;
  const color = useWatch({ control: form.control, name: "brandColor" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = application ? await updateApplicationAction(application.id, values) : await createApplicationAction(values);
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: m });
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!application && res.data && typeof res.data === "object" && "id" in res.data) router.push(`/applications/${res.data.id}`);
      router.refresh();
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        {application ? (
          <Button variant="outline">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New application
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{application ? "Edit application" : "New application"}</DialogTitle>
            <DialogDescription>Applications group creatives and campaigns. No code change is needed to add one.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="app-name">Name</FieldLabel>
              <Input id="app-name" {...form.register("name")} />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.brandColor}>
              <FieldLabel htmlFor="app-color">Brand colour</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick colour"
                  value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#4F46E5"}
                  onChange={(e) => form.setValue("brandColor", e.target.value.toUpperCase(), { shouldValidate: true })}
                  className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
                />
                <Input id="app-color" className="w-32 font-mono" {...form.register("brandColor")} />
              </div>
              {errors.brandColor ? <FieldError>{errors.brandColor.message}</FieldError> : <FieldDescription>Used for badges and charts.</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="app-description">Description</FieldLabel>
              <Textarea id="app-description" rows={3} {...form.register("description")} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {application ? "Save changes" : "Create application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
