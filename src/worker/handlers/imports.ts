import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromBuffer } from "file-type";
import type { CreativeCategory, VersionType } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { badgesForFilename } from "@/lib/badges";
import { prisma } from "@/lib/db";
import { getEnv, MB } from "@/lib/env";
import { pairPreviewsLoosely, planAssociations, resolveAssociations } from "@/lib/files/matching";
import { platformFolder } from "@/lib/files/import-layout";
import { nextFreeName, normalizeMatchKey, parseFilename } from "@/lib/files/naming";
import { defaultCategoryFor, fileTypeForName, sniffMatches } from "@/lib/files/types";
import { newId } from "@/lib/ids";
import { notifyUsers } from "@/lib/notifications";
import { canEditCreative, hasApplicationAccess, type Actor } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { originalKey } from "@/lib/storage/keys";
import { deleteObjects, getObjectStream, uploadStream } from "@/lib/storage/s3";
import {
  decodeEntryName,
  isEncryptedEntry,
  isJunkEntry,
  isSuspiciousRatio,
  isSymlinkEntry,
  normalizeEntryPath,
} from "@/lib/zip/safety";
import { applicationKeys, applicationNameFromFolder } from "@/server/services/applications";
import { listBadges } from "@/server/services/badges";
import { attachFile, createCreativeRecord } from "@/server/services/creatives";
import { log } from "../log";
import { iterateEntries, openEntryStream, openZip, readEntryHead } from "../zip";

async function loadActor(userId: string | null): Promise<(Actor & { name: string }) | null> {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, applicationAccess: { select: { applicationId: true } } },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role.key,
    restrictApplications: user.restrictApplications,
    applicationIds: user.applicationAccess.map((a) => a.applicationId),
  };
}

async function downloadArchive(key: string, dir: string) {
  const path = join(dir, "archive.zip");
  await pipeline(await getObjectStream(key), createWriteStream(path));
  return path;
}

async function failBatch(batchId: string, message: string, notifyUserId: string | null) {
  const batch = await prisma.importBatch.update({ where: { id: batchId }, data: { status: "FAILED", errorMessage: message.slice(0, 1000) } });
  await logActivity({
    actorId: notifyUserId,
    action: "IMPORT_FAILED",
    entityType: "IMPORT",
    entityId: batchId,
    applicationId: batch.applicationId,
    summary: `Import of ${batch.archiveFilename} failed: ${message}`,
  });
  if (notifyUserId) {
    await notifyUsers([notifyUserId], {
      type: "IMPORT_FAILED",
      title: `Import failed: ${batch.archiveFilename}`,
      body: message,
      link: `/imports/${batchId}`,
    });
  }
}

type AnalyzedEntry = {
  tmpId: string;
  entryPath: string;
  filename: string;
  segments: string[];
  sizeBytes: number;
  compressedBytes: number;
  rejectReason: string | null;
};

/**
 * Inspect an uploaded archive without extracting it to disk: validate every
 * entry, sniff content types, detect `_preview` files and suggest application,
 * campaign and creative associations for the review step.
 */
export async function analyzeImport(payload: { batchId: string }) {
  const batch = await prisma.importBatch.findUnique({ where: { id: payload.batchId } });
  if (!batch || batch.status !== "ANALYZING" || !batch.archiveKey) return;
  const env = getEnv();
  const settings = await getSettings();
  const maxFileBytes = settings.maxUploadSizeMb * MB;
  const actor = await loadActor(batch.createdById);
  if (!actor) return failBatch(batch.id, "The user who started this import is no longer active.", null);

  const tmp = await mkdtemp(join(env.WORKER_TMP_DIR ?? tmpdir(), "cmp-zip-"));
  try {
    const archivePath = await downloadArchive(batch.archiveKey, tmp);
    let zip;
    try {
      zip = await openZip(archivePath);
    } catch (err) {
      return failBatch(batch.id, `This is not a valid ZIP archive (${err instanceof Error ? err.message : err}).`, batch.createdById);
    }

    const entries: AnalyzedEntry[] = [];
    let count = 0;
    let totalUncompressed = 0;
    try {
      for await (const entry of iterateEntries(zip)) {
        count++;
        if (count > env.ZIP_MAX_ENTRIES) {
          return failBatch(batch.id, `The archive contains more than ${env.ZIP_MAX_ENTRIES} entries.`, batch.createdById);
        }
        const rawName = decodeEntryName(entry.fileName as Buffer, entry.generalPurposeBitFlag);
        if (rawName.endsWith("/") || rawName.endsWith("\\")) continue; // directory
        const norm = normalizeEntryPath(rawName);
        if (norm.ok && isJunkEntry(norm.path)) continue;

        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > env.ZIP_MAX_UNCOMPRESSED_MB * MB) {
          return failBatch(batch.id, `The archive expands to more than ${env.ZIP_MAX_UNCOMPRESSED_MB} MB.`, batch.createdById);
        }

        const filename = norm.ok ? norm.segments[norm.segments.length - 1] : rawName.split(/[\\/]/).pop() || rawName;
        let reason: string | null = null;
        const def = fileTypeForName(filename);
        if (!norm.ok) reason = norm.reason;
        else if (isSymlinkEntry(entry.externalFileAttributes, entry.versionMadeBy)) reason = "Symbolic links are not allowed.";
        else if (isEncryptedEntry(entry.generalPurposeBitFlag)) reason = "Encrypted entries are not supported.";
        else if (!def) reason = "Unsupported file type.";
        else if (entry.uncompressedSize === 0) reason = "Empty file.";
        else if (entry.uncompressedSize > maxFileBytes) reason = `Larger than the ${settings.maxUploadSizeMb} MB limit.`;
        else if (isSuspiciousRatio(entry.uncompressedSize, entry.compressedSize, env.ZIP_MAX_COMPRESSION_RATIO)) {
          reason = "Suspicious compression ratio (possible zip bomb).";
        }
        if (!reason && def) {
          try {
            const head = await readEntryHead(zip, entry);
            const detected = await fileTypeFromBuffer(head);
            if (!sniffMatches(def, detected?.mime, head)) reason = `Content does not match the .${def.extensions[0]} extension.`;
          } catch (err) {
            reason = `Unreadable entry (${err instanceof Error ? err.message : err}).`;
          }
        }
        entries.push({
          tmpId: newId(),
          entryPath: norm.ok ? norm.path : rawName.slice(0, 1024),
          filename: filename.slice(0, 255),
          segments: norm.ok ? norm.segments.slice(0, -1) : [],
          sizeBytes: entry.uncompressedSize,
          compressedBytes: entry.compressedSize,
          rejectReason: reason,
        });
      }
    } finally {
      zip.close();
    }

    // Platform (application) and campaign from folder names.
    const allApps = await prisma.application.findMany({ select: { id: true, name: true, slug: true, status: true } });
    const apps = allApps.filter((a) => a.status === "ACTIVE" && hasApplicationAccess(actor, a.id));
    const campaigns = await prisma.campaign.findMany({
      where: { applicationId: { in: apps.map((a) => a.id) }, status: { not: "ARCHIVED" } },
      select: { id: true, name: true, slug: true, applicationId: true },
    });
    const appKeys = apps.map((a) => ({ id: a.id, keys: applicationKeys(a) }));
    const badges = await listBadges();
    const campaignKeys = campaigns.map((c) => ({ ...c, keys: new Set([normalizeMatchKey(c.name), normalizeMatchKey(c.slug)]) }));

    const accepted = entries.filter((e) => !e.rejectReason);
    const enriched = accepted.map((e) => {
      const segKeys = e.segments.map(normalizeMatchKey);
      const folder = platformFolder(e.segments);
      let suggestedApp: string | null = null;
      let newApplicationName: string | null = null;
      let platformNote: string | null = null;
      if (folder?.platform) {
        const key = normalizeMatchKey(folder.platform);
        suggestedApp = appKeys.find((a) => a.keys.has(key))?.id ?? null;
        if (!suggestedApp) {
          const known = allApps.find((a) => applicationKeys(a).has(key));
          if (known) platformNote = `“${known.name}” is disabled or not accessible to you; the default application is used.`;
          else newApplicationName = applicationNameFromFolder(folder.platform);
        }
      } else {
        suggestedApp = appKeys.find((a) => segKeys.some((k) => a.keys.has(k)))?.id ?? null;
      }
      const applicationId = newApplicationName ? null : (suggestedApp ?? batch.applicationId);
      const suggestedCampaign = applicationId
        ? (campaignKeys.find((c) => c.applicationId === applicationId && segKeys.some((k) => c.keys.has(k)))?.id ?? null)
        : null;
      const campaignId = suggestedCampaign ?? (applicationId === batch.applicationId ? batch.campaignId : null);
      const parsed = parseFilename(e.filename);
      const def = fileTypeForName(e.filename)!;
      const category = (folder?.category ?? defaultCategoryFor(def.mediaType)) as CreativeCategory;
      // Grouping key for the platform, including platforms created on confirmation.
      const platformKey = applicationId ?? `new:${normalizeMatchKey(newApplicationName!)}`;
      return { ...e, parsed, def, applicationId, newApplicationName, platformKey, platformNote, campaignId, suggestedApp, suggestedCampaign, category };
    });

    // Imports always create new creatives: files are paired with each other
    // (full + preview), never attached to creatives already in the library.
    const planFiles = pairPreviewsLoosely(
      enriched.map((e) => ({ clientId: e.tmpId, applicationId: e.platformKey, matchKey: e.parsed.matchKey, versionType: e.parsed.detectedVersionType })),
    );
    const matchKeyOf = new Map(planFiles.map((f) => [f.clientId, f.matchKey]));
    const suggestions = planAssociations(planFiles, []);
    // Undecided items default to their own new creative but are flagged for review.
    const associations = new Map(
      enriched.map((e) => [e.tmpId, suggestions.get(e.tmpId)?.association ?? { kind: "new" as const, groupKey: e.tmpId }]),
    );
    const resolved = resolveAssociations(associations);

    // Names already used in each application: an existing "Spot" makes this one "Spot (2)".
    const appIds = [...new Set(enriched.flatMap((e) => (e.applicationId ? [e.applicationId] : [])))];
    const existingNames = appIds.length
      ? await prisma.creative.findMany({ where: { applicationId: { in: appIds } }, select: { applicationId: true, name: true } })
      : [];
    const taken = new Map<string, Set<string>>();
    for (const c of existingNames) {
      const set = taken.get(c.applicationId) ?? new Set<string>();
      set.add(c.name.toLowerCase());
      taken.set(c.applicationId, set);
    }
    const creativeNames = new Map<string, string>();
    for (const e of enriched) {
      const r = resolved.get(e.tmpId);
      if (r?.kind !== "new" || r.groupKey !== e.tmpId) continue; // only the leader of a new creative
      const set = taken.get(e.platformKey) ?? new Set<string>();
      const name = nextFreeName(e.parsed.displayName, set);
      set.add(name.toLowerCase());
      taken.set(e.platformKey, set);
      creativeNames.set(e.tmpId, name);
    }

    await prisma.$transaction(async (tx) => {
      await tx.importItem.deleteMany({ where: { batchId: batch.id } });
      const rows = entries.map((e) => {
        const en = enriched.find((x) => x.tmpId === e.tmpId);
        const parsed = parseFilename(e.filename);
        const def = fileTypeForName(e.filename);
        if (!en) {
          return {
            id: e.tmpId,
            batchId: batch.id,
            entryPath: e.entryPath,
            filename: e.filename,
            sizeBytes: BigInt(e.sizeBytes),
            compressedBytes: BigInt(e.compressedBytes),
            mimeType: def?.mime ?? "application/octet-stream",
            extension: parsed.extension.slice(0, 10),
            mediaType: def?.mediaType ?? ("OTHER" as const),
            versionType: parsed.detectedVersionType,
            matchKey: parsed.matchKey,
            groupKey: e.tmpId,
            creativeName: parsed.displayName,
            category: defaultCategoryFor(def?.mediaType ?? "OTHER") as CreativeCategory,
            include: false,
            status: "REJECTED" as const,
            rejectReason: e.rejectReason,
          };
        }
        const suggestion = suggestions.get(en.tmpId);
        const r = resolved.get(en.tmpId);
        const notes = [
          en.newApplicationName ? `New platform “${en.newApplicationName}” will be created when you confirm.` : null,
          en.platformNote,
          suggestion?.reason ?? null,
        ].filter(Boolean);
        return {
          id: en.tmpId,
          batchId: batch.id,
          entryPath: en.entryPath,
          filename: en.filename,
          sizeBytes: BigInt(en.sizeBytes),
          compressedBytes: BigInt(en.compressedBytes),
          mimeType: en.def.mime,
          extension: en.parsed.extension,
          mediaType: en.def.mediaType,
          versionType: en.parsed.detectedVersionType as VersionType,
          matchKey: matchKeyOf.get(en.tmpId) ?? en.parsed.matchKey,
          groupKey: r?.kind === "new" ? r.groupKey : en.tmpId,
          targetCreativeId: null,
          creativeName: creativeNames.get(en.tmpId) ?? en.parsed.displayName,
          category: en.category,
          suggestedApplicationId: en.suggestedApp,
          suggestedCampaignId: en.suggestedCampaign,
          applicationId: en.applicationId,
          newApplicationName: en.newApplicationName,
          campaignId: en.campaignId,
          badgeIds: badgesForFilename(badges, en.filename).map((b) => b.id),
          include: true,
          needsReview: suggestion?.needsDecision ?? false,
          note: notes.join(" ") || null,
          status: "PENDING" as const,
        };
      });
      for (let i = 0; i < rows.length; i += 500) {
        await tx.importItem.createMany({ data: rows.slice(i, i + 500) });
      }
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "READY_FOR_REVIEW",
          totalEntries: entries.length,
          totalBytes: BigInt(accepted.reduce((s, e) => s + e.sizeBytes, 0)),
          skippedCount: entries.length - accepted.length,
          errorMessage: null,
        },
      });
    });

    if (batch.createdById) {
      await notifyUsers([batch.createdById], {
        type: "IMPORT_READY",
        title: `Import ready for review: ${batch.archiveFilename}`,
        body: `${accepted.length} file(s) can be imported${entries.length - accepted.length ? `, ${entries.length - accepted.length} rejected` : ""}.`,
        link: `/imports/${batch.id}`,
      });
    }
    log.info("analyze-import: done", { batchId: batch.id, entries: entries.length, accepted: accepted.length });
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Extract the confirmed entries straight from the archive to storage (byte-for-byte),
 * then register creatives and versions exactly as the review defined them.
 */
export async function runImport(payload: { batchId: string }) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: payload.batchId },
    include: { items: { where: { include: true, status: { in: ["PENDING", "IMPORTING", "FAILED"] } } } },
  });
  if (!batch || batch.status !== "IMPORTING" || !batch.archiveKey) return;
  const actor = await loadActor(batch.createdById);
  if (!actor) return failBatch(batch.id, "The user who started this import is no longer active.", null);

  const tmp = await mkdtemp(join(getEnv().WORKER_TMP_DIR ?? tmpdir(), "cmp-zip-"));
  try {
    const archivePath = await downloadArchive(batch.archiveKey, tmp);
    const zip = await openZip(archivePath);
    const wanted = new Map(batch.items.map((i) => [i.entryPath, i]));
    const entriesByPath = new Map<string, import("yauzl").Entry>();
    try {
      for await (const entry of iterateEntries(zip)) {
        const norm = normalizeEntryPath(decodeEntryName(entry.fileName as Buffer, entry.generalPurposeBitFlag));
        if (norm.ok && wanted.has(norm.path)) entriesByPath.set(norm.path, entry);
      }

      // Group items: existing creative targets, or new-creative groups.
      const groups = new Map<string, typeof batch.items>();
      for (const item of batch.items) {
        const key = item.targetCreativeId ? `existing:${item.targetCreativeId}` : `new:${item.groupKey}`;
        groups.set(key, [...(groups.get(key) ?? []), item]);
      }

      const existingBadgeIds = new Set((await listBadges()).map((b) => b.id));
      let imported = 0;
      let failed = 0;
      for (const [groupKey, items] of groups) {
        const leader = items.find((i) => i.versionType === "FULL") ?? items[0];
        const applicationId = leader.applicationId ?? batch.applicationId;
        let creativeId: string;
        let createdHere = false;
        try {
          if (groupKey.startsWith("existing:")) {
            const target = await prisma.creative.findUnique({
              where: { id: leader.targetCreativeId! },
              select: { id: true, applicationId: true, createdById: true, status: true, submittedAt: true },
            });
            if (!target || !canEditCreative(actor, target)) throw new Error("The selected creative is no longer available.");
            creativeId = target.id;
          } else {
            if (!hasApplicationAccess(actor, applicationId)) throw new Error("No access to the selected application.");
            const created = await prisma.$transaction((tx) =>
              createCreativeRecord(tx, {
                name: leader.creativeName,
                applicationId,
                campaignId: leader.campaignId,
                category: leader.category,
                matchKey: leader.matchKey,
                mediaType: leader.mediaType,
                createdById: actor.id,
                badgeIds: [...new Set(items.flatMap((i) => i.badgeIds))].filter((id) => existingBadgeIds.has(id)),
              }),
            );
            creativeId = created.id;
            createdHere = true;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await prisma.importItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { status: "FAILED", errorMessage: message } });
          failed += items.length;
          continue;
        }

        let attached = 0;
        for (const item of items) {
          const entry = entriesByPath.get(item.entryPath);
          if (!entry) {
            await prisma.importItem.update({ where: { id: item.id }, data: { status: "FAILED", errorMessage: "Entry not found in archive." } });
            failed++;
            continue;
          }
          await prisma.importItem.update({ where: { id: item.id }, data: { status: "IMPORTING" } });
          const def = fileTypeForName(item.filename)!;
          const fileId = newId();
          const creativeApp = (await prisma.creative.findUnique({ where: { id: creativeId }, select: { applicationId: true } }))!.applicationId;
          const key = originalKey(creativeApp, creativeId, fileId, item.filename);
          try {
            const hash = createHash("sha256");
            let head = Buffer.alloc(0);
            let bytes = 0;
            const tap = new Transform({
              transform(chunk: Buffer, _e, cb) {
                hash.update(chunk);
                bytes += chunk.length;
                if (head.length < 4100) head = Buffer.concat([head, chunk.subarray(0, 4100 - head.length)]);
                cb(null, chunk);
              },
            });
            const stream = await openEntryStream(zip, entry);
            await uploadStream(key, stream.pipe(tap), def.mime);
            const detected = await fileTypeFromBuffer(head);
            if (!sniffMatches(def, detected?.mime, head) || bytes !== Number(item.sizeBytes)) {
              await deleteObjects([key]).catch(() => undefined);
              throw new Error("Extracted content failed validation.");
            }
            await prisma.$transaction((tx) =>
              attachFile(
                tx,
                {
                  fileId,
                  creativeId,
                  versionType: item.versionType,
                  originalFilename: item.filename,
                  storageKey: key,
                  sizeBytes: BigInt(bytes),
                  mimeType: def.mime,
                  extension: item.extension,
                  mediaType: def.mediaType,
                  checksumSha256: hash.digest("hex"),
                  uploadedById: actor.id,
                },
                { id: actor.id, name: actor.name },
              ),
            );
            await prisma.importItem.update({
              where: { id: item.id },
              data: { status: "IMPORTED", createdCreativeId: creativeId, createdFileId: fileId, errorMessage: null },
            });
            imported++;
            attached++;
          } catch (err) {
            failed++;
            await prisma.importItem.update({
              where: { id: item.id },
              data: { status: "FAILED", errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
            });
          }
        }
        if (createdHere && attached === 0) await prisma.creative.deleteMany({ where: { id: creativeId } });
      }

      const skipped = await prisma.importItem.count({ where: { batchId: batch.id, OR: [{ include: false }, { status: "REJECTED" }] } });
      const archiveKey = batch.keepArchive ? batch.archiveKey : null;
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          status: imported === 0 && failed > 0 ? "FAILED" : "COMPLETED",
          importedCount: imported,
          failedCount: failed,
          skippedCount: skipped,
          completedAt: new Date(),
          archiveKey,
          errorMessage: imported === 0 && failed > 0 ? "No file could be imported." : null,
        },
      });
      if (!batch.keepArchive) await deleteObjects([batch.archiveKey]).catch(() => undefined);
      await logActivity({
        actorId: actor.id,
        action: "IMPORT_COMPLETED",
        entityType: "IMPORT",
        entityId: batch.id,
        applicationId: batch.applicationId,
        summary: `${actor.name} imported ${imported} file(s) from ${batch.archiveFilename}${failed ? ` (${failed} failed)` : ""}`,
        metadata: { imported, failed, skipped },
      });
      await notifyUsers([actor.id], {
        type: imported === 0 && failed > 0 ? "IMPORT_FAILED" : "IMPORT_COMPLETED",
        title: `Import finished: ${batch.archiveFilename}`,
        body: `${imported} imported${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped` : ""}.`,
        link: `/imports/${batch.id}`,
      });
      log.info("run-import: done", { batchId: batch.id, imported, failed });
    } finally {
      zip.close();
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function importFailed(payload: { batchId: string }, error: unknown) {
  const batch = await prisma.importBatch.findUnique({ where: { id: payload.batchId }, select: { createdById: true, status: true } });
  if (!batch || batch.status === "COMPLETED") return;
  await failBatch(payload.batchId, error instanceof Error ? error.message : String(error), batch.createdById);
}
