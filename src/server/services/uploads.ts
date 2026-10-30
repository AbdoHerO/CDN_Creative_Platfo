import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { CreativeCategory, Channel, VersionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getEnv, MB } from "@/lib/env";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { planAssociations, resolveAssociations, type Association, type Candidate } from "@/lib/files/matching";
import { parseFilename } from "@/lib/files/naming";
import { defaultCategoryFor, fileTypeForName, sniffMatches, ZIP_TYPE, type FileTypeDef } from "@/lib/files/types";
import { newId } from "@/lib/ids";
import { enqueueJob } from "@/lib/jobs";
import { canEditCreative, can, hasApplicationAccess } from "@/lib/permissions";
import type { RequestMeta } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObjects,
  getObjectHead,
  headObject,
  listUploadedParts,
  presignPutObject,
  presignUploadPart,
} from "@/lib/storage/r2";
import { importArchiveKey, originalKey } from "@/lib/storage/keys";
import { creativeVisibilityWhere } from "@/lib/visibility";
import { logActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/auth/session-core";
import { attachFile, createCreativeRecord } from "./creatives";

/**
 * Direct-to-R2 upload lifecycle.
 *
 *  1. plan     – validate names/sizes and suggest full/preview associations.
 *  2. batch    – create creatives for new groups + one UploadSession per file.
 *  3. parts    – presign part URLs on demand (multipart) / single PUT URL.
 *  4. complete – verify size and magic bytes, then register the CreativeFile.
 *
 * Files never pass through the application server, and are stored exactly as
 * uploaded: no compression, resizing or re-encoding.
 */

const MAX_FILES_PER_BATCH = 200;
const MAX_PARTS = 10_000;

export function uploadLimits() {
  const env = getEnv();
  return {
    partSize: env.UPLOAD_PART_SIZE_MB * MB,
    multipartThreshold: env.UPLOAD_MULTIPART_THRESHOLD_MB * MB,
  };
}

export function computeParts(sizeBytes: number) {
  const { partSize: basePart, multipartThreshold } = uploadLimits();
  if (sizeBytes < multipartThreshold) return { mode: "SINGLE" as const, partSize: null, partCount: null };
  // R2 requires every part except the last to have the same size.
  const minForCount = Math.ceil(sizeBytes / MAX_PARTS);
  const partSize = Math.max(basePart, Math.ceil(minForCount / MB) * MB);
  return { mode: "MULTIPART" as const, partSize, partCount: Math.ceil(sizeBytes / partSize) };
}

async function assertUploadableApplication(user: SessionUser, applicationId: string) {
  const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { id: true, status: true, name: true } });
  if (!app || !hasApplicationAccess(user, app.id)) throw new NotFoundError("Application not found.");
  if (app.status !== "ACTIVE") throw new AppError(`${app.name} is disabled and does not accept new uploads.`, 409);
  return app;
}

function validateFileBasics(name: string, size: number, maxBytes: number): { def: FileTypeDef | null; error: string | null } {
  const def = fileTypeForName(name);
  if (!def) return { def: null, error: "Unsupported file type." };
  if (!Number.isFinite(size) || size <= 0) return { def, error: "The file is empty." };
  if (size > maxBytes) return { def, error: `The file exceeds the ${Math.round(maxBytes / MB / 1024) >= 1 ? `${(maxBytes / MB / 1024).toFixed(0)} GB` : `${Math.round(maxBytes / MB)} MB`} limit.` };
  return { def, error: null };
}

// ── 1. plan ──────────────────────────────────────────────────────────────────

export const planSchema = z.object({
  applicationId: z.string().min(1),
  files: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        name: z.string().min(1).max(255),
        size: z.number().int().nonnegative(),
        versionType: z.enum(VersionType).optional(),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_BATCH),
});

export async function planUpload(user: SessionUser, input: z.infer<typeof planSchema>) {
  if (!can(user.role, "creative.upload")) throw new ForbiddenError();
  await assertUploadableApplication(user, input.applicationId);
  const settings = await getSettings();
  const maxBytes = settings.maxUploadSizeMb * MB;

  const parsed = input.files.map((f) => {
    const p = parseFilename(f.name);
    const { def, error } = validateFileBasics(f.name, f.size, maxBytes);
    return {
      clientId: f.clientId,
      name: p.filename,
      parsed: p,
      def,
      error,
      versionType: f.versionType ?? p.detectedVersionType,
    };
  });

  const valid = parsed.filter((p) => !p.error);
  const keys = [...new Set(valid.map((p) => p.parsed.matchKey))];
  const existing = keys.length
    ? await prisma.creative.findMany({
        where: {
          AND: [
            creativeVisibilityWhere(user),
            { applicationId: input.applicationId, matchKey: { in: keys }, status: { not: "ARCHIVED" } },
          ],
        },
        select: { id: true, name: true, status: true, applicationId: true, matchKey: true, createdById: true, files: { select: { versionType: true } } },
        take: 500,
      })
    : [];
  // Only offer creatives the user may actually add versions to.
  const candidates: Candidate[] = existing
    .filter((c) => canEditCreative(user, c))
    .map((c) => ({
      creativeId: c.id,
      applicationId: c.applicationId,
      matchKey: c.matchKey,
      name: c.name,
      status: c.status,
      hasFull: c.files.some((f) => f.versionType === "FULL"),
    }));

  const suggestions = planAssociations(
    valid.map((p) => ({ clientId: p.clientId, applicationId: input.applicationId, matchKey: p.parsed.matchKey, versionType: p.versionType })),
    candidates,
  );

  return {
    maxFileSizeBytes: maxBytes,
    files: parsed.map((p) => ({
      clientId: p.clientId,
      name: p.name,
      error: p.error,
      displayName: p.parsed.displayName,
      matchKey: p.parsed.matchKey,
      extension: p.parsed.extension,
      isPreviewName: p.parsed.isPreview,
      versionType: p.versionType,
      mediaType: p.def?.mediaType ?? "OTHER",
      mimeType: p.def?.mime ?? "application/octet-stream",
      defaultCategory: defaultCategoryFor(p.def?.mediaType ?? "OTHER"),
      suggestion: suggestions.get(p.clientId) ?? null,
    })),
  };
}

// ── 2. batch ─────────────────────────────────────────────────────────────────

const associationSchema: z.ZodType<Association> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("new"), groupKey: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("existing"), creativeId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("withFile"), clientId: z.string().min(1).max(64) }),
]);

export const batchSchema = z.object({
  applicationId: z.string().min(1),
  campaignId: z.string().min(1).nullish(),
  description: z.string().max(5000).nullish(),
  tags: z.array(z.string().max(40)).max(30).default([]),
  channels: z.array(z.enum(Channel)).max(20).default([]),
  files: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        name: z.string().min(1).max(255),
        size: z.number().int().positive(),
        lastModified: z.number().int().nonnegative(),
        versionType: z.enum(VersionType),
        label: z.string().max(80).nullish(),
        creativeName: z.string().trim().max(200).nullish(),
        category: z.enum(CreativeCategory).nullish(),
        association: associationSchema,
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_BATCH),
});

export type BatchSessionInfo = {
  clientId: string;
  sessionId: string;
  creativeId: string;
  mode: "SINGLE" | "MULTIPART";
  partSize: number | null;
  partCount: number | null;
  mimeType: string;
  singleUrl: string | null;
};

export async function createUploadBatch(user: SessionUser, raw: z.input<typeof batchSchema>) {
  if (!can(user.role, "creative.upload")) throw new ForbiddenError();
  // Validated here as well so non-HTTP callers get the same guarantees.
  const input = batchSchema.parse(raw);
  await assertUploadableApplication(user, input.applicationId);
  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { applicationId: true } });
    if (!campaign || campaign.applicationId !== input.applicationId) throw new AppError("The campaign does not belong to this application.", 422);
  }
  const settings = await getSettings();
  const maxBytes = settings.maxUploadSizeMb * MB;

  const byClient = new Map(input.files.map((f) => [f.clientId, f]));
  if (byClient.size !== input.files.length) throw new AppError("Duplicate file ids in batch.", 422);
  for (const f of input.files) {
    const { error } = validateFileBasics(f.name, f.size, maxBytes);
    if (error) throw new AppError(`${f.name}: ${error}`, 422);
    if (f.association.kind === "withFile" && !byClient.has(f.association.clientId)) {
      throw new AppError(`${f.name}: linked file is not part of this batch.`, 422);
    }
  }
  const resolved = resolveAssociations(new Map(input.files.map((f) => [f.clientId, f.association])));
  for (const f of input.files) {
    if (!resolved.get(f.clientId)) throw new AppError(`${f.name}: choose which creative this file belongs to.`, 422);
  }

  // Validate every targeted existing creative.
  const existingIds = [...new Set([...resolved.values()].flatMap((r) => (r?.kind === "existing" ? [r.creativeId] : [])))];
  const existing = await prisma.creative.findMany({
    where: { id: { in: existingIds } },
    select: { id: true, applicationId: true, createdById: true, status: true, submittedAt: true },
  });
  for (const id of existingIds) {
    const c = existing.find((e) => e.id === id);
    if (!c || c.applicationId !== input.applicationId) throw new AppError("A selected creative does not belong to this application.", 422);
    if (!canEditCreative(user, c)) throw new ForbiddenError("You cannot add versions to one of the selected creatives.");
  }

  // Group files that will create the same new creative.
  const groups = new Map<string, typeof input.files>();
  for (const f of input.files) {
    const r = resolved.get(f.clientId)!;
    if (r.kind === "new") groups.set(r.groupKey, [...(groups.get(r.groupKey) ?? []), f]);
  }

  const sessionPlans = await prisma.$transaction(async (tx) => {
    const creativeForGroup = new Map<string, string>();
    for (const [groupKey, files] of groups) {
      const leader = files.find((f) => f.versionType === "FULL") ?? files[0];
      const parsed = parseFilename(leader.name);
      const def = fileTypeForName(leader.name)!;
      const creative = await createCreativeRecord(tx, {
        name: leader.creativeName || parsed.displayName,
        applicationId: input.applicationId,
        campaignId: input.campaignId ?? null,
        category: leader.category ?? defaultCategoryFor(def.mediaType),
        description: input.description ?? null,
        channels: input.channels,
        tags: input.tags,
        matchKey: parsed.matchKey,
        mediaType: def.mediaType,
        createdById: user.id,
      });
      creativeForGroup.set(groupKey, creative.id);
    }

    const plans: (BatchSessionInfo & { storageKey: string; uploadIdNeeded: boolean })[] = [];
    const expiresAt = new Date(Date.now() + getEnv().UPLOAD_SESSION_TTL_HOURS * 3600 * 1000);
    for (const f of input.files) {
      const r = resolved.get(f.clientId)!;
      const creativeId = r.kind === "new" ? creativeForGroup.get(r.groupKey)! : r.creativeId;
      const def = fileTypeForName(f.name)!;
      const fileId = newId();
      const storageKey = originalKey(input.applicationId, creativeId, fileId, f.name);
      const parts = computeParts(f.size);
      const session = await tx.uploadSession.create({
        data: {
          userId: user.id,
          purpose: "CREATIVE_FILE",
          mode: parts.mode,
          storageKey,
          filename: parseFilename(f.name).filename,
          sizeBytes: BigInt(f.size),
          mimeType: def.mime,
          partSize: parts.partSize,
          partCount: parts.partCount,
          fingerprint: `${f.name}:${f.size}:${f.lastModified}`,
          creativeId,
          fileId,
          versionType: f.versionType,
          label: f.label ?? null,
          expiresAt,
        },
      });
      plans.push({
        clientId: f.clientId,
        sessionId: session.id,
        creativeId,
        mode: parts.mode,
        partSize: parts.partSize,
        partCount: parts.partCount,
        mimeType: def.mime,
        singleUrl: null,
        storageKey,
        uploadIdNeeded: parts.mode === "MULTIPART",
      });
    }
    return plans;
  });

  // Start the R2 uploads outside the DB transaction (network calls).
  const out: BatchSessionInfo[] = [];
  for (const plan of sessionPlans) {
    try {
      if (plan.uploadIdNeeded) {
        const uploadId = await createMultipartUpload(plan.storageKey, plan.mimeType);
        await prisma.uploadSession.update({ where: { id: plan.sessionId }, data: { uploadId } });
      } else {
        plan.singleUrl = await presignPutObject(plan.storageKey, plan.mimeType);
      }
    } catch (err) {
      await prisma.uploadSession.update({
        where: { id: plan.sessionId },
        data: { status: "FAILED", errorMessage: err instanceof Error ? err.message.slice(0, 500) : "Storage error" },
      });
      throw err;
    }
    out.push({
      clientId: plan.clientId,
      sessionId: plan.sessionId,
      creativeId: plan.creativeId,
      mode: plan.mode,
      partSize: plan.partSize,
      partCount: plan.partCount,
      mimeType: plan.mimeType,
      singleUrl: plan.singleUrl,
    });
  }

  // Batch creation itself is not audited; each file is logged when its upload completes.
  return out;
}

// ── 3. parts / resume ────────────────────────────────────────────────────────

async function loadOwnSession(user: SessionUser, sessionId: string) {
  const session = await prisma.uploadSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== user.id) throw new NotFoundError("Upload not found.");
  return session;
}

function assertActive(session: { status: string; expiresAt: Date }) {
  if (session.status !== "UPLOADING") throw new AppError(`This upload is ${session.status.toLowerCase()}.`, 409);
  if (session.expiresAt.getTime() < Date.now()) throw new AppError("This upload session expired. Please start again.", 410);
}

export async function presignParts(user: SessionUser, sessionId: string, partNumbers: number[]) {
  const session = await loadOwnSession(user, sessionId);
  assertActive(session);
  if (session.mode === "SINGLE") {
    return { mode: "SINGLE" as const, url: await presignPutObject(session.storageKey, session.mimeType), parts: [] };
  }
  if (!session.uploadId || !session.partCount) throw new AppError("Upload is not initialised.", 409);
  const unique = [...new Set(partNumbers)].filter((n) => Number.isInteger(n) && n >= 1 && n <= session.partCount!);
  if (unique.length === 0 || unique.length > 100) throw new AppError("Request between 1 and 100 parts at a time.", 422);
  const parts = await Promise.all(
    unique.map(async (partNumber) => ({ partNumber, url: await presignUploadPart(session.storageKey, session.uploadId!, partNumber) })),
  );
  return { mode: "MULTIPART" as const, url: null, parts };
}

/** State needed to resume an interrupted upload (parts already stored in R2). */
export async function getUploadStatus(user: SessionUser, sessionId: string) {
  const session = await loadOwnSession(user, sessionId);
  let uploadedParts: { partNumber: number; etag: string; size: number }[] = [];
  if (session.status === "UPLOADING" && session.mode === "MULTIPART" && session.uploadId) {
    uploadedParts = await listUploadedParts(session.storageKey, session.uploadId);
  }
  return {
    sessionId: session.id,
    status: session.status,
    mode: session.mode,
    filename: session.filename,
    sizeBytes: Number(session.sizeBytes),
    partSize: session.partSize,
    partCount: session.partCount,
    fingerprint: session.fingerprint,
    creativeId: session.creativeId,
    mimeType: session.mimeType,
    expiresAt: session.expiresAt.toISOString(),
    uploadedParts,
  };
}

export async function listResumableUploads(user: SessionUser) {
  const sessions = await prisma.uploadSession.findMany({
    where: { userId: user.id, status: "UPLOADING", purpose: "CREATIVE_FILE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      filename: true,
      sizeBytes: true,
      fingerprint: true,
      createdAt: true,
      versionType: true,
      creative: { select: { id: true, name: true, application: { select: { name: true } } } },
    },
  });
  return sessions.map((s) => ({
    id: s.id,
    filename: s.filename,
    sizeBytes: Number(s.sizeBytes),
    fingerprint: s.fingerprint,
    createdAt: s.createdAt.toISOString(),
    versionType: s.versionType,
    creativeId: s.creative?.id ?? null,
    creativeName: s.creative?.name ?? null,
    applicationName: s.creative?.application.name ?? null,
  }));
}

// ── 4. complete / abort ──────────────────────────────────────────────────────

export const completeSchema = z.object({
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .transform((v) => v.toLowerCase())
    .optional(),
});

async function verifyStoredObject(session: { storageKey: string; sizeBytes: bigint; filename: string }, def: FileTypeDef) {
  const head = await headObject(session.storageKey);
  if (!head) throw new AppError("The uploaded file was not found in storage. Please retry the upload.", 409);
  if (BigInt(head.size) !== session.sizeBytes) {
    throw new AppError(`Size mismatch: expected ${session.sizeBytes} bytes but storage has ${head.size}. Please retry.`, 409);
  }
  const bytes = await getObjectHead(session.storageKey, 4100);
  const detected = await fileTypeFromBuffer(bytes);
  if (!sniffMatches(def, detected?.mime, bytes)) {
    throw new AppError(
      `“${session.filename}” does not look like a valid .${def.extensions[0]} file${detected ? ` (detected ${detected.mime})` : ""}. It was rejected.`,
      422,
    );
  }
}

export async function completeUpload(user: SessionUser, sessionId: string, input: z.infer<typeof completeSchema>, meta?: RequestMeta | null) {
  const session = await loadOwnSession(user, sessionId);
  assertActive(session);
  const def = session.purpose === "ZIP_IMPORT" ? ZIP_TYPE : fileTypeForName(session.filename);
  if (!def) throw new AppError("Unsupported file type.", 422);

  try {
    if (session.mode === "MULTIPART") {
      if (!session.uploadId || !session.partCount) throw new AppError("Upload is not initialised.", 409);
      // Use R2's own part listing as the source of truth (not client-supplied ETags).
      const parts = await listUploadedParts(session.storageKey, session.uploadId);
      const numbers = new Set(parts.map((p) => p.partNumber));
      const missing: number[] = [];
      for (let i = 1; i <= session.partCount; i++) if (!numbers.has(i)) missing.push(i);
      if (missing.length) throw new AppError(`Upload incomplete: ${missing.length} part(s) missing.`, 409);
      await completeMultipartUpload(
        session.storageKey,
        session.uploadId,
        parts.filter((p) => p.partNumber <= session.partCount!),
      );
    }
    await verifyStoredObject(session, def);
  } catch (err) {
    // Content/size rejections are final: remove the object and fail the session.
    if (err instanceof AppError && (err.status === 422 || err.message.startsWith("Size mismatch"))) {
      await deleteObjects([session.storageKey]).catch(() => undefined);
      await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "FAILED", errorMessage: err.message.slice(0, 500) } });
      await cleanupEmptyCreative(session.creativeId);
    }
    throw err;
  }

  if (session.purpose === "ZIP_IMPORT") {
    await prisma.$transaction(async (tx) => {
      await tx.uploadSession.update({
        where: { id: session.id },
        data: { status: "COMPLETED", completedAt: new Date(), checksumSha256: input.sha256 ?? null },
      });
      await tx.importBatch.update({ where: { id: session.importBatchId! }, data: { status: "ANALYZING", archiveKey: session.storageKey } });
      await enqueueJob("ANALYZE_IMPORT", { batchId: session.importBatchId! }, { db: tx });
    });
    return { kind: "import" as const, batchId: session.importBatchId! };
  }

  const file = await prisma.$transaction(async (tx) => {
    const fresh = await tx.uploadSession.findUniqueOrThrow({ where: { id: session.id } });
    if (fresh.status !== "UPLOADING") throw new AppError("This upload was already completed.", 409);
    const created = await attachFile(
      tx,
      {
        fileId: session.fileId!,
        creativeId: session.creativeId!,
        versionType: session.versionType ?? "FULL",
        label: session.label,
        originalFilename: session.filename,
        storageKey: session.storageKey,
        sizeBytes: session.sizeBytes,
        mimeType: def.mime,
        extension: parseFilename(session.filename).extension,
        mediaType: def.mediaType,
        checksumSha256: input.sha256 ?? null,
        uploadedById: user.id,
      },
      { id: user.id, name: user.name },
      meta,
    );
    await tx.uploadSession.update({
      where: { id: session.id },
      data: { status: "COMPLETED", completedAt: new Date(), checksumSha256: input.sha256 ?? null },
    });
    return created;
  });
  return { kind: "file" as const, fileId: file.id, creativeId: file.creativeId };
}

export async function abortUpload(user: SessionUser, sessionId: string) {
  const session = await loadOwnSession(user, sessionId);
  if (session.status !== "UPLOADING") return { status: session.status };
  if (session.mode === "MULTIPART" && session.uploadId) {
    await abortMultipartUpload(session.storageKey, session.uploadId).catch(() => undefined);
  } else {
    await deleteObjects([session.storageKey]).catch(() => undefined);
  }
  await prisma.uploadSession.update({ where: { id: session.id }, data: { status: "ABORTED" } });
  if (session.importBatchId) {
    await prisma.importBatch.update({ where: { id: session.importBatchId }, data: { status: "CANCELLED" } });
  }
  await cleanupEmptyCreative(session.creativeId);
  return { status: "ABORTED" };
}

/** Remove a creative created for a batch when none of its uploads succeeded. */
export async function cleanupEmptyCreative(creativeId: string | null) {
  if (!creativeId) return;
  const [files, active] = await Promise.all([
    prisma.creativeFile.count({ where: { creativeId } }),
    prisma.uploadSession.count({ where: { creativeId, status: "UPLOADING" } }),
  ]);
  if (files === 0 && active === 0) {
    await prisma.creative.delete({ where: { id: creativeId } }).catch(() => undefined);
  }
}

// ── ZIP import upload ────────────────────────────────────────────────────────

export const importStartSchema = z.object({
  applicationId: z.string().min(1),
  campaignId: z.string().min(1).nullish(),
  keepArchive: z.boolean().optional(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  lastModified: z.number().int().nonnegative(),
});

export async function startImportUpload(user: SessionUser, input: z.infer<typeof importStartSchema>, meta?: RequestMeta | null) {
  if (!can(user.role, "import.create")) throw new ForbiddenError();
  await assertUploadableApplication(user, input.applicationId);
  if (!/\.zip$/i.test(input.name)) throw new AppError("Only .zip archives can be imported.", 422);
  const env = getEnv();
  const maxArchive = Math.max(env.ZIP_MAX_UNCOMPRESSED_MB, (await getSettings()).maxUploadSizeMb) * MB;
  if (input.size > maxArchive) throw new AppError("The archive is too large.", 422);
  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { applicationId: true } });
    if (!campaign || campaign.applicationId !== input.applicationId) throw new AppError("The campaign does not belong to this application.", 422);
  }
  const settings = await getSettings();
  const parts = computeParts(input.size);
  const batch = await prisma.importBatch.create({
    data: {
      createdById: user.id,
      applicationId: input.applicationId,
      campaignId: input.campaignId ?? null,
      archiveFilename: parseFilename(input.name).filename,
      archiveSizeBytes: BigInt(input.size),
      keepArchive: input.keepArchive ?? settings.keepImportArchives,
    },
  });
  const storageKey = importArchiveKey(batch.id, input.name);
  const session = await prisma.uploadSession.create({
    data: {
      userId: user.id,
      purpose: "ZIP_IMPORT",
      mode: parts.mode,
      storageKey,
      filename: parseFilename(input.name).filename,
      sizeBytes: BigInt(input.size),
      mimeType: ZIP_TYPE.mime,
      partSize: parts.partSize,
      partCount: parts.partCount,
      fingerprint: `${input.name}:${input.size}:${input.lastModified}`,
      importBatchId: batch.id,
      expiresAt: new Date(Date.now() + env.UPLOAD_SESSION_TTL_HOURS * 3600 * 1000),
    },
  });
  let singleUrl: string | null = null;
  if (parts.mode === "MULTIPART") {
    const uploadId = await createMultipartUpload(storageKey, ZIP_TYPE.mime);
    await prisma.uploadSession.update({ where: { id: session.id }, data: { uploadId } });
  } else {
    singleUrl = await presignPutObject(storageKey, ZIP_TYPE.mime);
  }
  await logActivity({
    actorId: user.id,
    action: "IMPORT_STARTED",
    entityType: "IMPORT",
    entityId: batch.id,
    applicationId: input.applicationId,
    summary: `${user.name} started importing ${batch.archiveFilename}`,
    meta,
  });
  return {
    batchId: batch.id,
    session: {
      clientId: "zip",
      sessionId: session.id,
      creativeId: "",
      mode: parts.mode,
      partSize: parts.partSize,
      partCount: parts.partCount,
      mimeType: ZIP_TYPE.mime,
      singleUrl,
    } satisfies BatchSessionInfo,
  };
}
