import { z } from "zod";
import { prisma, type Db } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** Admin-editable platform settings, stored as JSON rows with typed defaults. */

export const settingsSchema = z.object({
  resetApprovalOnNewVersion: z.boolean(),
  keepImportArchives: z.boolean(),
  maxUploadSizeMb: z.number().int().min(1).max(1024 * 1024),
  storageWarningThresholdGb: z.number().min(1).max(1_000_000),
  storagePricePerGbMonth: z.number().min(0).max(100),
  defaultPageSize: z.union([z.literal(24), z.literal(48), z.literal(96)]),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;

export function defaultSettings(): PlatformSettings {
  return {
    resetApprovalOnNewVersion: true,
    keepImportArchives: false,
    maxUploadSizeMb: getEnv().UPLOAD_MAX_FILE_SIZE_MB,
    storageWarningThresholdGb: 500,
    storagePricePerGbMonth: 0.015,
    defaultPageSize: 24,
  };
}

export async function getSettings(db: Db = prisma): Promise<PlatformSettings> {
  const rows = await db.systemSetting.findMany();
  const merged: Record<string, unknown> = { ...defaultSettings() };
  for (const row of rows) merged[row.key] = row.value;
  const parsed = settingsSchema.safeParse(merged);
  const settings = parsed.success ? parsed.data : defaultSettings();
  // The environment cap is a hard limit admins cannot raise from the UI.
  settings.maxUploadSizeMb = Math.min(settings.maxUploadSizeMb, getEnv().UPLOAD_MAX_FILE_SIZE_MB);
  return settings;
}

export async function saveSettings(values: PlatformSettings, userId: string, db: Db = prisma) {
  for (const [key, value] of Object.entries(values)) {
    await db.systemSetting.upsert({
      where: { key },
      create: { key, value: value as never, updatedById: userId },
      update: { value: value as never, updatedById: userId },
    });
  }
}
