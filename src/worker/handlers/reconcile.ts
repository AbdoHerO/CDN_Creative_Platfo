import type { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { KEY_PREFIXES } from "@/lib/storage/keys";
import { listAllObjects } from "@/lib/storage/r2";
import { log } from "../log";

/**
 * Compare the bucket with database records:
 * - actual object count / bytes per prefix,
 * - orphans (objects no record references),
 * - missing objects (records whose object is gone).
 */
export async function reconcileStorage(payload: { snapshotId: string }) {
  const snapshot = await prisma.storageSnapshot.findUnique({ where: { id: payload.snapshotId } });
  if (!snapshot || snapshot.status !== "RUNNING") return;

  const [files, logos, imports, sessions] = await Promise.all([
    prisma.creativeFile.findMany({ select: { storageKey: true, thumbnailKey: true, displayKey: true } }),
    prisma.application.findMany({ where: { logoKey: { not: null } }, select: { logoKey: true } }),
    prisma.importBatch.findMany({ where: { archiveKey: { not: null } }, select: { archiveKey: true } }),
    prisma.uploadSession.findMany({ where: { status: "UPLOADING" }, select: { storageKey: true } }),
  ]);
  const known = new Set<string>();
  const originals = new Set<string>();
  for (const f of files) {
    known.add(f.storageKey);
    originals.add(f.storageKey);
    if (f.thumbnailKey) known.add(f.thumbnailKey);
    if (f.displayKey) known.add(f.displayKey);
  }
  for (const l of logos) if (l.logoKey) known.add(l.logoKey);
  for (const i of imports) if (i.archiveKey) known.add(i.archiveKey);
  for (const s of sessions) known.add(s.storageKey);

  const byPrefix: Record<string, { objects: number; bytes: number }> = {};
  let totalObjects = 0;
  let totalBytes = 0;
  let orphanObjects = 0;
  let orphanBytes = 0;
  const orphanSamples: { key: string; size: number }[] = [];
  const seenOriginals = new Set<string>();

  for await (const obj of listAllObjects()) {
    totalObjects++;
    totalBytes += obj.size;
    const prefix = Object.values(KEY_PREFIXES).find((p) => obj.key.startsWith(p)) ?? "other/";
    byPrefix[prefix] ??= { objects: 0, bytes: 0 };
    byPrefix[prefix].objects++;
    byPrefix[prefix].bytes += obj.size;
    if (originals.has(obj.key)) seenOriginals.add(obj.key);
    if (!known.has(obj.key)) {
      orphanObjects++;
      orphanBytes += obj.size;
      if (orphanSamples.length < 50) orphanSamples.push({ key: obj.key, size: obj.size });
    }
  }
  const missing = [...originals].filter((k) => !seenOriginals.has(k));

  await prisma.storageSnapshot.update({
    where: { id: snapshot.id },
    data: {
      status: "COMPLETED",
      totalObjects,
      totalBytes: BigInt(totalBytes),
      orphanObjects,
      orphanBytes: BigInt(orphanBytes),
      missingObjects: missing.length,
      details: { byPrefix, orphanSamples, missingSamples: missing.slice(0, 50) } as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
  await logActivity({
    actorId: snapshot.requestedById,
    action: "STORAGE_RECONCILED",
    entityType: "STORAGE",
    entityId: snapshot.id,
    summary: `Storage reconciled: ${totalObjects} objects, ${orphanObjects} orphaned, ${missing.length} missing`,
    metadata: { totalObjects, totalBytes, orphanObjects, missing: missing.length },
  });
  log.info("reconcile: done", { totalObjects, orphanObjects, missing: missing.length });
}

export async function reconcileFailed(payload: { snapshotId: string }, error: unknown) {
  await prisma.storageSnapshot
    .update({
      where: { id: payload.snapshotId },
      data: { status: "FAILED", error: (error instanceof Error ? error.message : String(error)).slice(0, 1000), completedAt: new Date() },
    })
    .catch(() => undefined);
}
