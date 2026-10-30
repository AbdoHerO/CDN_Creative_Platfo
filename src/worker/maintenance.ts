import { prisma } from "@/lib/db";
import { isStorageConfigured } from "@/lib/env";
import { abortMultipartUpload, deleteObjects } from "@/lib/storage/s3";
import { backfillStreamCopies } from "./handlers/stream-copy";
import { log } from "./log";

const LOCK_ID = 727_001;

/**
 * Periodic housekeeping, guarded by a Postgres advisory lock so only one worker
 * replica runs it at a time.
 */
export async function runMaintenance() {
  const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_ID}) AS locked`;
  if (!locked) return;
  try {
    const now = new Date();
    const sessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    const limits = await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } } });

    // Expire abandoned uploads and release their storage.
    const expired = await prisma.uploadSession.findMany({
      where: { status: "UPLOADING", expiresAt: { lt: now } },
      take: 200,
      select: { id: true, storageKey: true, uploadId: true, mode: true, creativeId: true, importBatchId: true },
    });
    for (const s of expired) {
      if (isStorageConfigured()) {
        try {
          if (s.mode === "MULTIPART" && s.uploadId) await abortMultipartUpload(s.storageKey, s.uploadId);
          else await deleteObjects([s.storageKey]);
        } catch (err) {
          log.warn("maintenance: could not release upload", { id: s.id, error: String(err) });
          continue;
        }
      }
      await prisma.uploadSession.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
      if (s.importBatchId) await prisma.importBatch.updateMany({ where: { id: s.importBatchId, status: "UPLOADING" }, data: { status: "CANCELLED" } });
    }

    // Creatives created for a batch whose uploads all failed or were abandoned.
    const orphans = await prisma.creative.deleteMany({
      where: {
        files: { none: {} },
        uploadSessions: { none: { status: "UPLOADING" } },
        createdAt: { lt: new Date(now.getTime() - 3600_000) },
      },
    });

    const oldJobs = await prisma.job.deleteMany({
      where: {
        OR: [
          { status: "COMPLETED", completedAt: { lt: new Date(now.getTime() - 7 * 86400_000) } },
          { status: "FAILED", updatedAt: { lt: new Date(now.getTime() - 30 * 86400_000) } },
        ],
      },
    });
    const streamCopies = await backfillStreamCopies();
    if (sessions.count || limits.count || expired.length || orphans.count || oldJobs.count || streamCopies) {
      log.info("maintenance", {
        sessions: sessions.count,
        rateLimits: limits.count,
        expiredUploads: expired.length,
        orphanCreatives: orphans.count,
        jobsPurged: oldJobs.count,
        streamCopiesQueued: streamCopies,
      });
    }
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}
