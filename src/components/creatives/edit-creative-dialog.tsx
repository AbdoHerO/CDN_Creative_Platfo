"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ChannelPicker } from "@/components/common/channel-picker";
import { TagInput } from "@/components/common/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Channel, CreativeCategory } from "@/generated/prisma/enums";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/constants";
import { updateCreativeAction } from "@/server/actions/creatives";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  description: z.string().max(5000),
  campaignId: z.string(),
  category: z.enum(CreativeCategory),
  channels: z.array(z.enum(Channel)),
  tags: z.array(z.string()),
  keywords: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

export function EditCreativeDialog({
  creative,
  campaigns,
  tagSuggestions,
}: {
  creative: {
    id: string;
    name: string;
    description: string | null;
    campaignId: string | null;
    category: CreativeCategory;
    channels: Channel[];
    tags: string[];
    keywords: string[];
  };
  campaigns: { id: string; name: string }[];
  tagSuggestions: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: Values = {
    name: creative.name,
    description: creative.description ?? "",
    campaignId: creative.campaignId ?? "",
    category: creative.category,
    channels: creative.channels,
    tags: creative.tags,
    keywords: creative.keywords.join(", "),
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await updateCreativeAction(creative.id, {
        ...values,
        campaignId: values.campaignId || null,
        description: values.description || null,
        keywords: values.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: m });
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Saved.");
      setOpen(false);
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
        <Button variant="outline">
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit creative</DialogTitle>
            <DialogDescription>Update metadata. Files and versions are not affected.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input id="edit-name" {...form.register("name")} />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.campaignId}>
                <FieldLabel>Campaign</FieldLabel>
                <Controller
                  control={form.control}
                  name="campaignId"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={(v) => field.onChange(v === "none" ? "" : v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No campaign</SelectItem>
                        {campaigns.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.campaignId && <FieldError>{errors.campaignId.message}</FieldError>}
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_ORDER.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Platforms / channels</FieldLabel>
              <Controller control={form.control} name="channels" render={({ field }) => <ChannelPicker value={field.value} onChange={field.onChange} />} />
            </Field>
            <Field>
              <FieldLabel>Tags</FieldLabel>
              <Controller
                control={form.control}
                name="tags"
                render={({ field }) => <TagInput value={field.value} onChange={field.onChange} suggestions={tagSuggestions} />}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-keywords">Keywords</FieldLabel>
              <Input id="edit-keywords" placeholder="comma, separated, keywords" {...form.register("keywords")} />
              <FieldDescription>Used by search in addition to the name, tags and filenames.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea id="edit-description" rows={4} {...form.register("description")} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
