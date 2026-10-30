"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { TagInput } from "@/components/common/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CampaignStatus } from "@/generated/prisma/enums";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/constants";
import { saveCampaignAction } from "@/server/actions/campaigns";

const schema = z
  .object({
    name: z.string().trim().min(2, "Name is required.").max(120),
    applicationId: z.string().min(1, "Choose an application."),
    description: z.string().max(2000),
    startDate: z.string(),
    endDate: z.string(),
    status: z.enum(CampaignStatus),
    tags: z.array(z.string()),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { path: ["endDate"], message: "End date must be after the start date." });
type Values = z.infer<typeof schema>;

export type CampaignFormValue = {
  id: string;
  name: string;
  applicationId: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: CampaignStatus;
  tags: string[];
};

export function CampaignFormDialog({
  campaign,
  applications,
  tagSuggestions,
  defaultApplicationId,
}: {
  campaign?: CampaignFormValue;
  applications: { id: string; name: string; brandColor: string }[];
  tagSuggestions: string[];
  defaultApplicationId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const defaults: Values = {
    name: campaign?.name ?? "",
    applicationId: campaign?.applicationId ?? defaultApplicationId ?? applications[0]?.id ?? "",
    description: campaign?.description ?? "",
    startDate: campaign?.startDate ?? "",
    endDate: campaign?.endDate ?? "",
    status: campaign?.status ?? "PLANNED",
    tags: campaign?.tags ?? [],
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveCampaignAction(campaign?.id ?? null, {
        ...values,
        description: values.description || null,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
      });
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: m });
        return void toast.error(res.error);
      }
      toast.success(res.message);
      setOpen(false);
      if (!campaign) router.push(`/campaigns/${res.data.id}`);
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
        {campaign ? (
          <Button variant="outline">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button>
            <Plus /> New campaign
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
            <DialogDescription>Campaigns group creatives of one application for a period of time.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="campaign-name">Name</FieldLabel>
              <Input id="campaign-name" {...form.register("name")} placeholder="e.g. Summer Campaign 2026" />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.applicationId}>
                <FieldLabel>Application</FieldLabel>
                <Controller
                  control={form.control}
                  name="applicationId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        {applications.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="size-2 rounded-full" style={{ backgroundColor: a.brandColor }} />
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.applicationId && <FieldError>{errors.applicationId.message}</FieldError>}
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Controller
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CAMPAIGN_STATUS_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="campaign-start">Start date</FieldLabel>
                <Input id="campaign-start" type="date" {...form.register("startDate")} />
              </Field>
              <Field data-invalid={!!errors.endDate}>
                <FieldLabel htmlFor="campaign-end">End date</FieldLabel>
                <Input id="campaign-end" type="date" {...form.register("endDate")} />
                {errors.endDate && <FieldError>{errors.endDate.message}</FieldError>}
              </Field>
            </div>
            <Field>
              <FieldLabel>Tags</FieldLabel>
              <Controller control={form.control} name="tags" render={({ field }) => <TagInput value={field.value} onChange={field.onChange} suggestions={tagSuggestions} />} />
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-description">Description</FieldLabel>
              <Textarea id="campaign-description" rows={3} {...form.register("description")} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {campaign ? "Save changes" : "Create campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
