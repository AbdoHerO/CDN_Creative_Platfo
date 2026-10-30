import "server-only";
import type { SessionUser } from "@/lib/auth/session-core";
import { prisma } from "@/lib/db";
import { fileTypeForName } from "@/lib/files/types";
import {
  canArchiveCreative,
  canDeleteCreative,
  canEditCreative,
  canRestoreCreative,
  canReviewCreative,
  canSubmitCreative,
  canViewCreative,
  canWithdrawCreative,
} from "@/lib/permissions";
import { trySignedGetUrl } from "@/lib/storage/r2";
import { creativeVisibilityWhere } from "@/lib/visibility";
import { availableActions, type WorkflowAction } from "@/lib/workflow";

export async function getCreativeDetail(user: SessionUser, creativeId: string) {
  const creative = await prisma.creative.findUnique({
    where: { id: creativeId },
    include: {
      application: { select: { id: true, name: true, brandColor: true, status: true } },
      campaign: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { name: true, slug: true } } } },
      files: {
        orderBy: [{ versionType: "asc" }, { versionNumber: "desc" }],
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      validations: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { id: true, name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } },
    },
  });
  if (!creative || !canViewCreative(user, creative)) return null;

  const files = await Promise.all(
    creative.files.map(async (f) => {
      const def = fileTypeForName(f.originalFilename);
      return {
        id: f.id,
        versionType: f.versionType,
        versionNumber: f.versionNumber,
        isCurrent: f.isCurrent,
        label: f.label,
        originalFilename: f.originalFilename,
        sizeBytes: Number(f.sizeBytes),
        mimeType: f.mimeType,
        extension: f.extension,
        mediaType: f.mediaType,
        width: f.width,
        height: f.height,
        durationSeconds: f.durationSeconds,
        frameRate: f.frameRate,
        videoCodec: f.videoCodec,
        audioCodec: f.audioCodec,
        bitrate: f.bitrate,
        pageCount: f.pageCount,
        checksumSha256: f.checksumSha256,
        verifiedSha256: f.verifiedSha256,
        integrityStatus: f.integrityStatus,
        processingStatus: f.processingStatus,
        processingError: f.processingError,
        browserPreviewable: def?.browserPreviewable ?? false,
        createdAt: f.createdAt.toISOString(),
        uploadedBy: f.uploadedBy,
        thumbnailUrl: await trySignedGetUrl(f.thumbnailKey, { stable: true }),
        displayUrl: await trySignedGetUrl(f.displayKey, { stable: true }),
        mediaUrl: await trySignedGetUrl(f.storageKey, { disposition: "inline", filename: f.originalFilename, contentType: f.mimeType }),
      };
    }),
  );

  const hasFull = files.some((f) => f.versionType === "FULL");
  const canEdit = canEditCreative(user, creative);

  // A preview uploaded before its full version: offer matching creatives to link to.
  const linkTargets =
    !hasFull && canEdit
      ? (
          await prisma.creative.findMany({
            where: {
              AND: [
                creativeVisibilityWhere(user),
                {
                  id: { not: creative.id },
                  applicationId: creative.applicationId,
                  matchKey: creative.matchKey,
                  status: { not: "ARCHIVED" },
                  files: { some: { versionType: "FULL" } },
                },
              ],
            },
            select: { id: true, name: true, status: true, applicationId: true, createdById: true, submittedAt: true },
            take: 10,
          })
        )
          .filter((c) => canEditCreative(user, c))
          .map((c) => ({ id: c.id, name: c.name, status: c.status }))
      : [];

  const approvedValidation = creative.status === "APPROVED" ? creative.validations.find((v) => v.action === "APPROVED") : null;

  const checks: Record<WorkflowAction, boolean> = {
    submit: canSubmitCreative(user, creative) && hasFull,
    withdraw: canWithdrawCreative(user, creative),
    startReview: canReviewCreative(user, creative),
    approve: canReviewCreative(user, creative),
    decline: canReviewCreative(user, creative),
    requestChanges: canReviewCreative(user, creative),
    reopen: canReviewCreative(user, creative),
    archive: canArchiveCreative(user, creative),
    restore: canRestoreCreative(user, creative),
  };
  const workflowActions = availableActions(creative.status).filter((a) => checks[a]);

  return {
    id: creative.id,
    name: creative.name,
    description: creative.description,
    status: creative.status,
    category: creative.category,
    mediaType: creative.mediaType,
    channels: creative.channels,
    keywords: creative.keywords,
    matchKey: creative.matchKey,
    tags: creative.tags.map((t) => t.tag),
    application: creative.application,
    campaign: creative.campaign,
    createdBy: creative.createdBy,
    createdAt: creative.createdAt.toISOString(),
    updatedAt: creative.updatedAt.toISOString(),
    submittedAt: creative.submittedAt?.toISOString() ?? null,
    approvedAt: creative.approvedAt?.toISOString() ?? null,
    files,
    hasFull,
    linkTargets,
    approvedFileId: approvedValidation?.fileId ?? null,
    validations: creative.validations.map((v) => ({
      id: v.id,
      action: v.action,
      fromStatus: v.fromStatus,
      toStatus: v.toStatus,
      comment: v.comment,
      reason: v.reason,
      fileId: v.fileId,
      reviewer: v.reviewer,
      createdAt: v.createdAt.toISOString(),
    })),
    activities: creative.activities.map((a) => ({
      id: a.id,
      action: a.action,
      summary: a.summary,
      actorName: a.actor?.name ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    permissions: {
      canEdit,
      canDelete: canDeleteCreative(user, creative),
      workflowActions,
    },
  };
}

export type CreativeDetail = NonNullable<Awaited<ReturnType<typeof getCreativeDetail>>>;
export type CreativeDetailFile = CreativeDetail["files"][number];
