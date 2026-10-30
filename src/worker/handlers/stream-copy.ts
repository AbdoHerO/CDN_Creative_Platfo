import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Prisma } from "@/generated/prisma/client";
import type { MediaType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getEnv, isStorageConfigured } from "@/lib/env";
import { wantsStreamCopy } from "@/lib/files/stream-copy";
import { fileTypeForName } from "@/lib/files/types";
import { enqueueJob } from "@/lib/jobs";
import { streamKey } from "@/lib/storage/keys";
import { deleteObjects, getObjectStream, uploadStream } from "@/lib/storage/s3";
import { log } from "../log";
import { makeStreamCopy } from "../media";

/**
 * Streaming copy of a heavy video (MAKE_STREAM job): the original is downloaded,
 * transcoded to a light 720p MP4 and stored as a separate object in the file's
 * display slot, which the library, the phone feed and the creative page play.
 * The outcome is recorded in `metadata.streamCopy` (ready / skipped / failed) so
 * a video is never transcoded twice for nothing.
 */

type StreamStatus = "ready" | "skipped" | "failed";

const enabled = () => getEnv().VIDEO_STREAM_COPY !== false;

async function markStream(fileId: string, status: StreamStatus, data: Prisma.CreativeFileUpdateManyMutationInput = {}) {
  const file = await prisma.creativeFile.findUnique({ where: { id: fileId }, select: { metadata: true } });
  if (!file) return 0;
  const metadata = { ...((file.metadata as Record<string, unknown> | null) ?? {}), streamCopy: status };
  const res = await prisma.creativeFile.updateMany({
    where: { id: fileId, ...(status === "ready" ? { displayKey: null } : {}) },
    data: { ...data, metadata },
  });
  return res.count;
}

export async function makeStream(payload: { fileId: string }) {
  const file = await prisma.creativeFile.findUnique({
    where: { id: payload.fileId },
    select: { id: true, storageKey: true, extension: true, mediaType: true, bitrate: true, durationSeconds: true, sizeBytes: true, displayKey: true },
  });
  if (!file || file.displayKey) return;
  if (!enabled() || !wantsStreamCopy(file, getEnv().VIDEO_STREAM_MIN_MBPS)) {
    await markStream(file.id, "skipped");
    return;
  }

  const tmp = await mkdtemp(join(getEnv().WORKER_TMP_DIR ?? tmpdir(), "cmp-stream-"));
  try {
    const input = join(tmp, `original.${file.extension || "bin"}`);
    await pipeline(await getObjectStream(file.storageKey), createWriteStream(input));
    const output = join(tmp, "stream.mp4");
    await makeStreamCopy(input, output, file.durationSeconds);
    const size = (await stat(output)).size;
    // Not worth storing when it saves little on a video browsers already play.
    if (fileTypeForName(`x.${file.extension}`)?.browserPreviewable && size > Number(file.sizeBytes) * 0.8) {
      await markStream(file.id, "skipped");
      log.info("stream-copy: skipped, no real saving", { fileId: file.id, original: Number(file.sizeBytes), copy: size });
      return;
    }
    const key = streamKey(file.id);
    await uploadStream(key, createReadStream(output), "video/mp4");
    const updated = await markStream(file.id, "ready", { displayKey: key, displayBytes: Math.min(2_147_483_647, size) });
    // The file was deleted (or replaced) while transcoding: drop the orphan copy.
    if (!updated && !(await prisma.creativeFile.findUnique({ where: { id: file.id }, select: { id: true } }))) await deleteObjects([key]);
    log.info("stream-copy: done", { fileId: file.id, original: Number(file.sizeBytes), copy: size });
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function makeStreamFailed(payload: { fileId: string }, error: unknown) {
  await markStream(payload.fileId, "failed");
  log.warn("stream-copy: failed", { fileId: payload.fileId, error: error instanceof Error ? error.message : String(error) });
}

/** After processing: queue a streaming copy when the video needs one. */
export async function queueStreamCopy(file: { id: string; mediaType: MediaType; extension: string; bitrate: number | null; displayKey: string | null }) {
  if (!enabled() || file.displayKey || !wantsStreamCopy(file, getEnv().VIDEO_STREAM_MIN_MBPS)) return false;
  await enqueueJob("MAKE_STREAM", { fileId: file.id }, { maxAttempts: 3 });
  return true;
}

/**
 * Videos processed before streaming copies existed: a few per maintenance run,
 * and only while the queue is idle, so uploads are never slowed down.
 */
export async function backfillStreamCopies(limit = 3) {
  if (!enabled() || !isStorageConfigured()) return 0;
  if (await prisma.job.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } })) return 0;
  const candidates = await prisma.$queryRaw<{ id: string; mediaType: "VIDEO"; extension: string; bitrate: number | null }[]>`
    SELECT "id", "mediaType", "extension", "bitrate" FROM "CreativeFile"
     WHERE "mediaType" = 'VIDEO' AND "displayKey" IS NULL AND "processingStatus" = 'READY'
       AND ("metadata" IS NULL OR "metadata"->>'streamCopy' IS NULL)
     ORDER BY "createdAt" DESC
     LIMIT 200`;
  const minMbps = getEnv().VIDEO_STREAM_MIN_MBPS;
  let queued = 0;
  for (const c of candidates) {
    if (!wantsStreamCopy(c, minMbps)) await markStream(c.id, "skipped");
    else if (queued < limit) {
      await enqueueJob("MAKE_STREAM", { fileId: c.id }, { maxAttempts: 3 });
      queued++;
    }
  }
  return queued;
}
