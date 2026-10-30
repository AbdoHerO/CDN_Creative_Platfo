import type { CreativeCategory, Channel, MediaType, VersionType } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { prisma, type Db, type Tx } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs";
import { canDeleteCreative, canEditCreative, type Actor } from "@/lib/permissions";
import type { RequestMeta } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { VERSION_TYPE_LABELS } from "@/lib/constants";
import { ensureTags, normalizeKeywords } from "./tags";

/**
 * Creative & version management. Every mutation runs in a transaction, locks the
 * creative row to serialise version numbering, and writes the audit log.
 */

export type ActorWithName = Actor & { name: string };

export async function lockCreative(tx: Tx, creativeId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Creative" WHERE "id" = ${creativeId} FOR UPDATE`;
}

export async function nextVersionNumber(db: Db, creativeId: string, versionType: VersionType) {
  const agg = await db.creativeFile.aggregate({ where: { creativeId, versionType }, _max: { versionNumber: true } });
  return (agg._max.versionNumber ?? 0) + 1;
}

/** Media type of a creative follows its current full version, else preview, else variant. */
export async function refreshCreativeMediaType(db: Db, creativeId: string) {
  const files = await db.creativeFile.findMany({
    where: { creativeId, isCurrent: true },
    select: { versionType: true, mediaType: true },
  });
  const order: VersionType[] = ["FULL", "PREVIEW", "VARIANT"];
  const primary = order.map((t) => files.find((f) => f.versionType === t)).find(Boolean);
  if (primary) await db.creative.update({ where: { id: creativeId }, data: { mediaType: primary.mediaType } });
}

export type NewCreativeInput = {
  name: string;
  applicationId: string;
  campaignId?: string | null;
  category: CreativeCategory;
  description?: string | null;
  channels?: Channel[];
  keywords?: string[];
  tags?: string[];
  matchKey: string;
  mediaType: MediaType;
  createdById: string;
};

/** Create the logical creative before its first file finishes uploading. */
export async function createCreativeRecord(tx: Tx, input: NewCreativeInput) {
  const tagIds = await ensureTags(tx, input.tags ?? []);
  return tx.creative.create({
    data: {
      name: input.name.trim().slice(0, 200) || "Untitled creative",
      applicationId: input.applicationId,
      campaignId: input.campaignId ?? null,
      category: input.category,
      description: input.description?.trim() || null,
      channels: input.channels ?? [],
      keywords: normalizeKeywords(input.keywords ?? []),
      matchKey: input.matchKey,
      mediaType: input.mediaType,
      createdById: input.createdById,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
  });
}

export type AttachFileInput = {
  fileId: string;
  creativeId: string;
  versionType: VersionType;
  label?: string | null;
  originalFilename: string;
  storageKey: string;
  sizeBytes: bigint;
  mimeType: string;
  extension: string;
  mediaType: MediaType;
  checksumSha256?: string | null;
  uploadedById: string;
};

/**
 * Register an uploaded object as a new version of a creative. The new version
 * becomes current for its type; earlier versions are kept as history.
 */
export async function attachFile(tx: Tx, input: AttachFileInput, actor: { id: string; name: string }, meta?: RequestMeta | null) {
  await lockCreative(tx, input.creativeId);
  const creative = await tx.creative.findUnique({
    where: { id: input.creativeId },
    select: { id: true, name: true, status: true, applicationId: true, _count: { select: { files: true } } },
  });
  if (!creative) throw new NotFoundError("The target creative no longer exists.");

  const versionNumber = await nextVersionNumber(tx, input.creativeId, input.versionType);
  await tx.creativeFile.updateMany({
    where: { creativeId: input.creativeId, versionType: input.versionType, isCurrent: true },
    data: { isCurrent: false },
  });
  const file = await tx.creativeFile.create({
    data: {
      id: input.fileId,
      creativeId: input.creativeId,
      versionType: input.versionType,
      versionNumber,
      isCurrent: true,
      label: input.label?.trim() || null,
      originalFilename: input.originalFilename,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      extension: input.extension,
      mediaType: input.mediaType,
      checksumSha256: input.checksumSha256 ?? null,
      integrityStatus: input.checksumSha256 ? "PENDING" : "UNVERIFIED",
      uploadedById: input.uploadedById,
    },
  });
  await refreshCreativeMediaType(tx, input.creativeId);
  await tx.creative.update({ where: { id: input.creativeId }, data: { updatedAt: new Date() } });

  const isFirstFile = creative._count.files === 0;
  const typeLabel = `${VERSION_TYPE_LABELS[input.versionType].toLowerCase()} version v${versionNumber}`;
  if (isFirstFile) {
    await logActivity(
      {
        actorId: actor.id,
        action: "CREATIVE_CREATED",
        entityType: "CREATIVE",
        entityId: creative.id,
        creativeId: creative.id,
        applicationId: creative.applicationId,
        summary: `${actor.name} uploaded “${creative.name}” (${input.originalFilename})`,
        metadata: { fileId: file.id, versionType: input.versionType, sizeBytes: Number(input.sizeBytes) },
        meta,
      },
      tx,
    );
  } else {
    await logActivity(
      {
        actorId: actor.id,
        action: "VERSION_UPLOADED",
        entityType: "FILE",
        entityId: file.id,
        creativeId: creative.id,
        applicationId: creative.applicationId,
        summary: `${actor.name} uploaded ${typeLabel} of “${creative.name}” (${input.originalFilename})`,
        metadata: { fileId: file.id, versionType: input.versionType, versionNumber, sizeBytes: Number(input.sizeBytes) },
        meta,
      },
      tx,
    );
  }

  // A new full version invalidates a previous approval (configurable).
  if (input.versionType === "FULL" && creative.status === "APPROVED" && versionNumber > 1) {
    const settings = await getSettings(tx);
    if (settings.resetApprovalOnNewVersion) {
      await tx.creative.update({ where: { id: creative.id }, data: { status: "DRAFT", approvedAt: null } });
      await tx.validation.create({
        data: {
          creativeId: creative.id,
          action: "RESET_NEW_VERSION",
          fromStatus: "APPROVED",
          toStatus: "DRAFT",
          reviewerId: actor.id,
          comment: `Full version v${versionNumber} uploaded; the creative must be validated again.`,
          fileId: file.id,
        },
      });
      await logActivity(
        {
          actorId: actor.id,
          action: "CREATIVE_STATUS_CHANGED",
          entityType: "CREATIVE",
          entityId: creative.id,
          creativeId: creative.id,
          applicationId: creative.applicationId,
          summary: `“${creative.name}” returned to draft because a new full version was uploaded`,
          metadata: { from: "APPROVED", to: "DRAFT" },
          meta,
        },
        tx,
      );
    }
  }

  await enqueueJob("PROCESS_FILE", { fileId: file.id }, { db: tx });
  return file;
}

async function loadForMutation(db: Db, creativeId: string) {
  const creative = await db.creative.findUnique({
    where: { id: creativeId },
    select: { id: true, name: true, status: true, applicationId: true, createdById: true, submittedAt: true },
  });
  if (!creative) throw new NotFoundError("Creative not found.");
  return creative;
}

export type MetadataInput = {
  name: string;
  description?: string | null;
  campaignId?: string | null;
  category: CreativeCategory;
  channels: Channel[];
  keywords: string[];
  tags: string[];
};

export async function updateCreativeMetadata(actor: ActorWithName, creativeId: string, input: MetadataInput, meta?: RequestMeta | null) {
  return prisma.$transaction(async (tx) => {
    const creative = await loadForMutation(tx, creativeId);
    if (!canEditCreative(actor, creative)) throw new ForbiddenError("You cannot edit this creative.");
    if (input.campaignId) {
      const campaign = await tx.campaign.findUnique({ where: { id: input.campaignId }, select: { applicationId: true } });
      if (!campaign || campaign.applicationId !== creative.applicationId) {
        throw new AppError("The campaign must belong to the creative's application.", 422, { campaignId: "Choose a campaign of this application." });
      }
    }
    const before = await tx.creative.findUniqueOrThrow({
      where: { id: creativeId },
      select: { name: true, description: true, campaignId: true, category: true, channels: true, keywords: true, tags: { select: { tag: { select: { name: true } } } } },
    });
    const tagIds = await ensureTags(tx, input.tags);
    await tx.creativeTag.deleteMany({ where: { creativeId } });
    await tx.creative.update({
      where: { id: creativeId },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        campaignId: input.campaignId || null,
        category: input.category,
        channels: input.channels,
        keywords: normalizeKeywords(input.keywords),
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    const changed = Object.entries({
      name: before.name !== input.name.trim(),
      description: (before.description ?? "") !== (input.description?.trim() ?? ""),
      campaign: (before.campaignId ?? null) !== (input.campaignId || null),
      category: before.category !== input.category,
      channels: before.channels.join(",") !== input.channels.join(","),
      keywords: before.keywords.join(",") !== normalizeKeywords(input.keywords).join(","),
      tags: before.tags.map((t) => t.tag.name).sort().join(",") !== [...input.tags].map((t) => t.trim().toLowerCase()).sort().join(","),
    })
      .filter(([, v]) => v)
      .map(([k]) => k);
    await logActivity(
      {
        actorId: actor.id,
        action: "CREATIVE_UPDATED",
        entityType: "CREATIVE",
        entityId: creativeId,
        creativeId,
        applicationId: creative.applicationId,
        summary: `${actor.name} updated ${changed.length ? changed.join(", ") : "metadata"} of “${input.name.trim()}”`,
        metadata: { changed },
        meta,
      },
      tx,
    );
  });
}

/** Permanently delete a creative; its objects are removed from R2 by the worker. */
export async function deleteCreative(actor: ActorWithName, creativeId: string, meta?: RequestMeta | null) {
  return prisma.$transaction(async (tx) => {
    await lockCreative(tx, creativeId);
    const creative = await loadForMutation(tx, creativeId);
    if (!canDeleteCreative(actor, creative)) throw new ForbiddenError("You cannot delete this creative.");
    const files = await tx.creativeFile.findMany({
      where: { creativeId },
      select: { storageKey: true, thumbnailKey: true, displayKey: true, sizeBytes: true },
    });
    const sessions = await tx.uploadSession.findMany({ where: { creativeId, status: "UPLOADING" }, select: { storageKey: true } });
    const keys = files.flatMap((f) => [f.storageKey, f.thumbnailKey, f.displayKey]).filter(Boolean) as string[];
    await tx.creative.delete({ where: { id: creativeId } });
    await enqueueJob("DELETE_OBJECTS", { keys: [...keys, ...sessions.map((s) => s.storageKey)], reason: `creative ${creativeId} deleted` }, { db: tx });
    await logActivity(
      {
        actorId: actor.id,
        action: "CREATIVE_DELETED",
        entityType: "CREATIVE",
        entityId: creativeId,
        applicationId: creative.applicationId,
        summary: `${actor.name} deleted “${creative.name}” (${files.length} file${files.length === 1 ? "" : "s"})`,
        metadata: { name: creative.name, files: files.length, bytes: files.reduce((s, f) => s + Number(f.sizeBytes), 0) },
        meta,
      },
      tx,
    );
    return { name: creative.name };
  });
}

async function promoteLatest(tx: Tx, creativeId: string, versionType: VersionType) {
  const latest = await tx.creativeFile.findFirst({
    where: { creativeId, versionType },
    orderBy: { versionNumber: "desc" },
    select: { id: true },
  });
  if (latest) await tx.creativeFile.update({ where: { id: latest.id }, data: { isCurrent: true } });
}

export async function deleteFile(actor: ActorWithName, fileId: string, meta?: RequestMeta | null) {
  return prisma.$transaction(async (tx) => {
    const file = await tx.creativeFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundError("File not found.");
    await lockCreative(tx, file.creativeId);
    const creative = await loadForMutation(tx, file.creativeId);
    if (!canEditCreative(actor, creative)) throw new ForbiddenError("You cannot modify this creative.");
    const count = await tx.creativeFile.count({ where: { creativeId: file.creativeId } });
    if (count <= 1) throw new AppError("This is the only file of the creative. Delete the creative instead.", 409);
    await tx.creativeFile.delete({ where: { id: fileId } });
    if (file.isCurrent) await promoteLatest(tx, file.creativeId, file.versionType);
    await refreshCreativeMediaType(tx, file.creativeId);
    await enqueueJob(
      "DELETE_OBJECTS",
      { keys: [file.storageKey, file.thumbnailKey, file.displayKey].filter(Boolean) as string[], reason: `file ${fileId} deleted` },
      { db: tx },
    );
    await logActivity(
      {
        actorId: actor.id,
        action: "FILE_DELETED",
        entityType: "FILE",
        entityId: fileId,
        creativeId: creative.id,
        applicationId: creative.applicationId,
        summary: `${actor.name} deleted ${VERSION_TYPE_LABELS[file.versionType].toLowerCase()} v${file.versionNumber} (${file.originalFilename}) of “${creative.name}”`,
        meta,
      },
      tx,
    );
  });
}

export async function setCurrentFile(actor: ActorWithName, fileId: string, meta?: RequestMeta | null) {
  return prisma.$transaction(async (tx) => {
    const file = await tx.creativeFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundError("File not found.");
    await lockCreative(tx, file.creativeId);
    const creative = await loadForMutation(tx, file.creativeId);
    if (!canEditCreative(actor, creative)) throw new ForbiddenError("You cannot modify this creative.");
    if (file.isCurrent) return;
    await tx.creativeFile.updateMany({ where: { creativeId: file.creativeId, versionType: file.versionType }, data: { isCurrent: false } });
    await tx.creativeFile.update({ where: { id: fileId }, data: { isCurrent: true } });
    await refreshCreativeMediaType(tx, file.creativeId);
    await logActivity(
      {
        actorId: actor.id,
        action: "FILE_SET_CURRENT",
        entityType: "FILE",
        entityId: fileId,
        creativeId: creative.id,
        applicationId: creative.applicationId,
        summary: `${actor.name} made ${VERSION_TYPE_LABELS[file.versionType].toLowerCase()} v${file.versionNumber} the current version of “${creative.name}”`,
        meta,
      },
      tx,
    );
  });
}

/**
 * Move a file to another creative of the same application — used to link an
 * unmatched preview to its full creative, or to fix a wrong association. An
 * emptied source creative is removed.
 */
export async function moveFile(
  actor: ActorWithName,
  fileId: string,
  targetCreativeId: string,
  versionType: VersionType | undefined,
  meta?: RequestMeta | null,
) {
  return prisma.$transaction(async (tx) => {
    const file = await tx.creativeFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundError("File not found.");
    if (file.creativeId === targetCreativeId) throw new AppError("The file already belongs to this creative.", 409);
    // Lock in a stable order to avoid deadlocks between concurrent moves.
    for (const id of [file.creativeId, targetCreativeId].sort()) await lockCreative(tx, id);
    const source = await loadForMutation(tx, file.creativeId);
    const target = await loadForMutation(tx, targetCreativeId);
    if (!canEditCreative(actor, source) || !canEditCreative(actor, target)) throw new ForbiddenError("You cannot modify these creatives.");
    if (source.applicationId !== target.applicationId) throw new AppError("Files can only be linked within the same application.", 422);

    const type = versionType ?? file.versionType;
    const versionNumber = await nextVersionNumber(tx, targetCreativeId, type);
    await tx.creativeFile.updateMany({ where: { creativeId: targetCreativeId, versionType: type, isCurrent: true }, data: { isCurrent: false } });
    await tx.creativeFile.update({
      where: { id: fileId },
      data: { creativeId: targetCreativeId, versionType: type, versionNumber, isCurrent: true },
    });
    if (file.isCurrent) await promoteLatest(tx, source.id, file.versionType);
    const remaining = await tx.creativeFile.count({ where: { creativeId: source.id } });
    let sourceDeleted = false;
    if (remaining === 0) {
      await tx.creative.delete({ where: { id: source.id } });
      sourceDeleted = true;
    } else {
      await refreshCreativeMediaType(tx, source.id);
    }
    await refreshCreativeMediaType(tx, targetCreativeId);
    await tx.creative.update({ where: { id: targetCreativeId }, data: { updatedAt: new Date() } });
    await logActivity(
      {
        actorId: actor.id,
        action: "FILE_MOVED",
        entityType: "FILE",
        entityId: fileId,
        creativeId: targetCreativeId,
        applicationId: target.applicationId,
        summary: `${actor.name} linked ${file.originalFilename} to “${target.name}” as ${VERSION_TYPE_LABELS[type].toLowerCase()} v${versionNumber}${sourceDeleted ? ` (merged from “${source.name}”)` : ""}`,
        metadata: { from: source.id, to: targetCreativeId, sourceDeleted },
        meta,
      },
      tx,
    );
    return { sourceDeleted, targetCreativeId };
  });
}
