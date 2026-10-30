import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { notifyUsers } from "@/lib/notifications";
import { displayKey, thumbnailKey } from "@/lib/storage/keys";
import { getObjectStream, putObject } from "@/lib/storage/s3";
import { extractMedia } from "../media";
import { log } from "../log";

/**
 * Post-upload processing for one CreativeFile:
 *  1. stream the original from storage to a temp file while computing SHA-256,
 *  2. compare with the checksum computed in the browser (integrity),
 *  3. extract metadata (resolution, duration, codecs, pages…),
 *  4. upload a thumbnail / display rendition as *separate* objects.
 * The original object is never rewritten.
 */
export async function processFile(payload: { fileId: string }) {
  const file = await prisma.creativeFile.findUnique({
    where: { id: payload.fileId },
    include: { creative: { select: { id: true, name: true, applicationId: true } } },
  });
  if (!file) {
    log.info("process-file: file no longer exists", payload);
    return;
  }
  await prisma.creativeFile.update({ where: { id: file.id }, data: { processingStatus: "PROCESSING", processingError: null } });

  const tmp = await mkdtemp(join(getEnv().WORKER_TMP_DIR ?? tmpdir(), "cmp-"));
  try {
    const localPath = join(tmp, `original.${file.extension || "bin"}`);
    const hash = createHash("sha256");
    const source = await getObjectStream(file.storageKey);
    await pipeline(
      source,
      new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          cb(null, chunk);
        },
      }),
      createWriteStream(localPath),
    );
    const sha256 = hash.digest("hex");
    const integrity = file.checksumSha256 ? (file.checksumSha256 === sha256 ? "VERIFIED" : "MISMATCH") : "UNVERIFIED";

    const media = await extractMedia(localPath, file.mediaType, file.extension, tmp);
    let thumbKey: string | null = null;
    let thumbBytes: number | null = null;
    let dispKey: string | null = null;
    let dispBytes: number | null = null;
    if (media.thumbnail) {
      thumbKey = thumbnailKey(file.id);
      thumbBytes = media.thumbnail.length;
      await putObject(thumbKey, media.thumbnail, "image/webp", "private, max-age=31536000, immutable");
    }
    if (media.display) {
      dispKey = displayKey(file.id);
      dispBytes = media.display.length;
      await putObject(dispKey, media.display, "image/webp", "private, max-age=31536000, immutable");
    }

    await prisma.creativeFile.update({
      where: { id: file.id },
      data: {
        width: media.width ?? null,
        height: media.height ?? null,
        durationSeconds: media.durationSeconds ?? null,
        frameRate: media.frameRate ?? null,
        videoCodec: media.videoCodec ?? null,
        audioCodec: media.audioCodec ?? null,
        bitrate: media.bitrate != null ? Math.min(2_147_483_647, Math.round(media.bitrate)) : null,
        pageCount: media.pageCount ?? null,
        verifiedSha256: sha256,
        integrityStatus: integrity,
        thumbnailKey: thumbKey,
        thumbnailBytes: thumbBytes,
        displayKey: dispKey,
        displayBytes: dispBytes,
        metadata: media.metadata as Prisma.InputJsonValue,
        processingStatus: "READY",
        processingError: media.warnings.length ? media.warnings.join(" · ").slice(0, 1000) : null,
        processedAt: new Date(),
      },
    });

    if (integrity === "MISMATCH") {
      log.warn("process-file: checksum mismatch", { fileId: file.id });
      await logActivity({
        actorId: null,
        action: "FILE_INTEGRITY_FAILED",
        entityType: "FILE",
        entityId: file.id,
        creativeId: file.creativeId,
        applicationId: file.creative.applicationId,
        summary: `Integrity check failed for ${file.originalFilename} of “${file.creative.name}”: stored bytes differ from the uploaded file`,
        metadata: { expected: file.checksumSha256, actual: sha256 },
      });
      if (file.uploadedById) {
        await notifyUsers([file.uploadedById], {
          type: "INTEGRITY_FAILED",
          title: `Integrity check failed: ${file.originalFilename}`,
          body: "The stored file does not match the file you uploaded. Please upload it again.",
          link: `/creatives/${file.creativeId}?file=${file.id}`,
          creativeId: file.creativeId,
        });
      }
    }
    log.info("process-file: done", { fileId: file.id, integrity, warnings: media.warnings.length });
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Called when all retries are exhausted. */
export async function processFileFailed(payload: { fileId: string }, error: unknown) {
  const file = await prisma.creativeFile.findUnique({
    where: { id: payload.fileId },
    select: { id: true, originalFilename: true, creativeId: true, uploadedById: true },
  });
  if (!file) return;
  const message = error instanceof Error ? error.message : String(error);
  await prisma.creativeFile.update({
    where: { id: file.id },
    data: { processingStatus: "FAILED", processingError: message.slice(0, 1000) },
  });
  if (file.uploadedById) {
    await notifyUsers([file.uploadedById], {
      type: "PROCESSING_FAILED",
      title: `Processing failed: ${file.originalFilename}`,
      body: "The original file is stored safely, but its thumbnail and metadata could not be generated.",
      link: `/creatives/${file.creativeId}?file=${file.id}`,
      creativeId: file.creativeId,
    });
  }
}
