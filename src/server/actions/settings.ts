"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { getEnv, isStorageConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs";
import { saveSettings, settingsSchema } from "@/lib/settings";
import { parseInput, runAction } from "@/server/action-utils";

export async function saveSettingsAction(input: z.input<typeof settingsSchema>) {
  return runAction(async () => {
    const user = await requireActionUser("settings.manage");
    const data = parseInput(settingsSchema, input);
    if (data.maxUploadSizeMb > getEnv().UPLOAD_MAX_FILE_SIZE_MB) {
      throw new AppError(`The server limit is ${getEnv().UPLOAD_MAX_FILE_SIZE_MB} MB.`, 422, { maxUploadSizeMb: "Above the server limit." });
    }
    await saveSettings(data, user.id);
    await logActivity({
      actorId: user.id,
      action: "SETTINGS_UPDATED",
      entityType: "SETTINGS",
      summary: `${user.name} updated platform settings`,
      metadata: data,
      meta: await getRequestMeta(),
    });
    revalidatePath("/", "layout");
    return true;
  }, "Settings saved.");
}

/** Queue a comparison of storage objects with database records. */
export async function startReconciliationAction() {
  return runAction(async () => {
    const user = await requireActionUser("storage.manage");
    if (!isStorageConfigured()) throw new AppError("Storage is not configured.", 503);
    const running = await prisma.storageSnapshot.findFirst({ where: { status: "RUNNING", createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if (running) throw new AppError("A reconciliation is already running.", 409);
    const snapshot = await prisma.storageSnapshot.create({ data: { requestedById: user.id } });
    await enqueueJob("RECONCILE_STORAGE", { snapshotId: snapshot.id }, { maxAttempts: 2 });
    revalidatePath("/storage");
    return { id: snapshot.id };
  }, "Reconciliation started. Results appear here when the worker finishes.");
}
