"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { PlatformSettings } from "@/lib/settings";
import { saveSettingsAction } from "@/server/actions/settings";

export function PlatformSettingsForm({ settings, serverMaxUploadMb }: { settings: PlatformSettings; serverMaxUploadMb: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const schema = z.object({
    resetApprovalOnNewVersion: z.boolean(),
    keepImportArchives: z.boolean(),
    maxUploadSizeMb: z.coerce.number().int().min(1, "At least 1 MB.").max(serverMaxUploadMb, `Server limit is ${serverMaxUploadMb} MB.`),
    storageWarningThresholdGb: z.coerce.number().min(1).max(1_000_000),
    storagePricePerGbMonth: z.coerce.number().min(0).max(100),
    defaultPageSize: z.coerce.number().refine((v) => [24, 48, 96].includes(v)),
  });
  type Values = z.input<typeof schema>;
  const form = useForm<Values, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: settings });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const res = await saveSettingsAction({ ...values, defaultPageSize: values.defaultPageSize as 24 | 48 | 96 });
      if (!res.ok) {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) form.setError(k as keyof Values, { message: m });
        return void toast.error(res.error);
      }
      toast.success(res.message);
      router.refresh();
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup className="gap-5">
        <Field orientation="horizontal" className="justify-between">
          <div>
            <FieldLabel htmlFor="reset-approval">Re-validate after a new full version</FieldLabel>
            <FieldDescription>Uploading a new full version to an approved creative returns it to draft.</FieldDescription>
          </div>
          <Controller
            control={form.control}
            name="resetApprovalOnNewVersion"
            render={({ field }) => <Switch id="reset-approval" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </Field>
        <Field orientation="horizontal" className="justify-between">
          <div>
            <FieldLabel htmlFor="keep-archives">Keep ZIP archives by default</FieldLabel>
            <FieldDescription>Store imported archives as an import record (uses additional storage).</FieldDescription>
          </div>
          <Controller control={form.control} name="keepImportArchives" render={({ field }) => <Switch id="keep-archives" checked={field.value} onCheckedChange={field.onChange} />} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.maxUploadSizeMb}>
            <FieldLabel htmlFor="max-upload">Maximum file size (MB)</FieldLabel>
            <Input id="max-upload" type="number" min={1} max={serverMaxUploadMb} {...form.register("maxUploadSizeMb")} />
            {errors.maxUploadSizeMb ? <FieldError>{errors.maxUploadSizeMb.message}</FieldError> : <FieldDescription>Server limit: {serverMaxUploadMb} MB.</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel>Library page size</FieldLabel>
            <Controller
              control={form.control}
              name="defaultPageSize"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[24, 48, 96].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} per page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field data-invalid={!!errors.storageWarningThresholdGb}>
            <FieldLabel htmlFor="threshold">Storage warning threshold (GB)</FieldLabel>
            <Input id="threshold" type="number" min={1} step="1" {...form.register("storageWarningThresholdGb")} />
            <FieldDescription>Dashboards warn when usage approaches this value.</FieldDescription>
          </Field>
          <Field data-invalid={!!errors.storagePricePerGbMonth}>
            <FieldLabel htmlFor="price">Storage price ($ per GB-month)</FieldLabel>
            <Input id="price" type="number" min={0} step="0.001" {...form.register("storagePricePerGbMonth")} />
            <FieldDescription>Your own storage cost per GB-month (disks, replication, backups). Used for cost estimates.</FieldDescription>
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner />}
            Save settings
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
