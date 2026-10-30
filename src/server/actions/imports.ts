"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CreativeCategory, VersionType } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { resolveAssociations, type Association } from "@/lib/files/matching";
import { enqueueJob } from "@/lib/jobs";
import { canEditCreative, hasApplicationAccess } from "@/lib/permissions";
import { deleteObjects } from "@/lib/storage/r2";
import { parseInput, runAction } from "@/server/action-utils";

const itemSchema = z.object({
  id: z.string().min(1).max(64),
  include: z.boolean(),
  versionType: z.enum(VersionType),
  creativeName: z.string().trim().min(1).max(200),
  category: z.enum(CreativeCategory),
  applicationId: z.string().min(1).max(64),
  campaignId: z.string().max(64).nullable(),
  association: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("new"), groupKey: z.string().min(1).max(64) }),
      z.object({ kind: z.literal("existing"), creativeId: z.string().min(1).max(64) }),
      z.object({ kind: z.literal("withFile"), clientId: z.string().min(1).max(64) }),
    ])
    .nullable(),
});

const confirmSchema = z.object({ items: z.array(itemSchema).max(10_000) });

async function loadOwnBatch(userId: string, isAdmin: boolean, batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId }, include: { items: true } });
  if (!batch) throw new NotFoundError("Import not found.");
  if (batch.createdById !== userId && !isAdmin) throw new ForbiddenError();
  return batch;
}

/** Save the reviewed associations and start extracting files into the library. */
export async function confirmImportAction(batchId: string, input: z.input<typeof confirmSchema>) {
  return runAction(async () => {
    const user = await requireActionUser("import.create");
    const { items } = parseInput(confirmSchema, input);
    const batch = await loadOwnBatch(user.id, user.role === "ADMIN", batchId);
    if (batch.status !== "READY_FOR_REVIEW") throw new AppError("This import is not waiting for review.", 409);

    const known = new Map(batch.items.map((i) => [i.id, i]));
    const included = items.filter((i) => i.include);
    if (included.length === 0) throw new AppError("Select at least one file to import.", 422);
    for (const item of items) {
      const original = known.get(item.id);
      if (!original) throw new AppError("Unknown item in import.", 422);
      if (original.status === "REJECTED" && item.include) throw new AppError(`${original.filename} was rejected and cannot be imported.`, 422);
      if (item.include && !item.association) throw new AppError(`Choose where “${original.filename}” belongs.`, 422);
    }

    // Validate applications, campaigns and target creatives.
    const appIds = [...new Set(included.map((i) => i.applicationId))];
    const apps = await prisma.application.findMany({ where: { id: { in: appIds } }, select: { id: true, status: true, name: true } });
    for (const id of appIds) {
      const app = apps.find((a) => a.id === id);
      if (!app || !hasApplicationAccess(user, id)) throw new AppError("An item targets an application you cannot access.", 422);
      if (app.status !== "ACTIVE") throw new AppError(`${app.name} is disabled.`, 422);
    }
    const campaignIds = [...new Set(included.map((i) => i.campaignId).filter(Boolean))] as string[];
    const campaigns = await prisma.campaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, applicationId: true } });
    for (const item of included) {
      if (item.campaignId && campaigns.find((c) => c.id === item.campaignId)?.applicationId !== item.applicationId) {
        throw new AppError("A campaign does not belong to the selected application.", 422);
      }
    }

    const resolved = resolveAssociations(new Map(included.map((i) => [i.id, i.association as Association])));
    const targetIds = [...new Set([...resolved.values()].flatMap((r) => (r?.kind === "existing" ? [r.creativeId] : [])))];
    const targets = await prisma.creative.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, applicationId: true, createdById: true, status: true, submittedAt: true },
    });
    for (const item of included) {
      const r = resolved.get(item.id);
      if (!r) throw new AppError(`Choose where “${known.get(item.id)!.filename}” belongs.`, 422);
      if (r.kind === "existing") {
        const t = targets.find((c) => c.id === r.creativeId);
        if (!t || !canEditCreative(user, t)) throw new AppError("A selected creative is not available.", 422);
        if (t.applicationId !== item.applicationId) throw new AppError("Files can only be added to creatives of the same application.", 422);
      }
    }
    // All files of one new creative must share the application.
    const groupApp = new Map<string, string>();
    for (const item of included) {
      const r = resolved.get(item.id)!;
      if (r.kind !== "new") continue;
      const existing = groupApp.get(r.groupKey);
      if (existing && existing !== item.applicationId) throw new AppError("Files grouped into one creative must belong to the same application.", 422);
      groupApp.set(r.groupKey, item.applicationId);
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const r = item.include ? resolved.get(item.id) : null;
        await tx.importItem.update({
          where: { id: item.id },
          data: {
            include: item.include,
            versionType: item.versionType,
            creativeName: item.creativeName,
            category: item.category,
            applicationId: item.applicationId,
            campaignId: item.campaignId,
            groupKey: r?.kind === "new" ? r.groupKey : item.id,
            targetCreativeId: r?.kind === "existing" ? r.creativeId : null,
            needsReview: false,
            status: known.get(item.id)!.status === "REJECTED" ? "REJECTED" : item.include ? "PENDING" : "SKIPPED",
          },
        });
      }
      await tx.importBatch.update({ where: { id: batch.id }, data: { status: "IMPORTING" } });
      await enqueueJob("RUN_IMPORT", { batchId: batch.id }, { db: tx, maxAttempts: 3 });
    });
    revalidatePath(`/imports/${batch.id}`);
    return { batchId: batch.id };
  }, "Import started. Files are being added to the library.");
}

export async function cancelImportAction(batchId: string) {
  return runAction(async () => {
    const user = await requireActionUser("import.create");
    const batch = await loadOwnBatch(user.id, user.role === "ADMIN", batchId);
    if (!["READY_FOR_REVIEW", "FAILED", "UPLOADING", "ANALYZING"].includes(batch.status)) {
      throw new AppError("This import can no longer be cancelled.", 409);
    }
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "CANCELLED", archiveKey: null } });
    if (batch.archiveKey) await deleteObjects([batch.archiveKey]).catch(() => undefined);
    await logActivity({
      actorId: user.id,
      action: "IMPORT_FAILED",
      entityType: "IMPORT",
      entityId: batch.id,
      applicationId: batch.applicationId,
      summary: `${user.name} cancelled the import of ${batch.archiveFilename}`,
      meta: await getRequestMeta(),
    });
    revalidatePath(`/imports/${batch.id}`);
    return true;
  }, "Import cancelled.");
}
