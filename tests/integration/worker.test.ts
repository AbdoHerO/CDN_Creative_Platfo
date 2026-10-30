import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";
import { originalKey, importArchiveKey } from "@/lib/storage/keys";
import { headObject, putObject } from "@/lib/storage/s3";
import { attachFile, createCreativeRecord } from "@/server/services/creatives";
import { analyzeImport, runImport } from "@/worker/handlers/imports";
import { processFile } from "@/worker/handlers/process-file";
import { claimJob, completeJob, failJob } from "@/worker/queue";
import { buildZip } from "../support/zip-writer";
import { mp4Bytes, pngBytes, readObject, resetDatabase, seedWorld, sha256, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

async function storedFile(bytes: Buffer, filename: string, mime: string, mediaType: "VIDEO" | "IMAGE" | "DOCUMENT", checksum?: string) {
  return prisma.$transaction(async (tx) => {
    const c = await createCreativeRecord(tx, { name: filename, applicationId: world.apps.alpha, category: "OTHER", matchKey: filename, mediaType, createdById: world.users.creator.id });
    const fileId = newId();
    const key = originalKey(world.apps.alpha, c.id, fileId, filename);
    await putObject(key, bytes, mime);
    return attachFile(
      tx,
      { fileId, creativeId: c.id, versionType: "FULL", originalFilename: filename, storageKey: key, sizeBytes: BigInt(bytes.length), mimeType: mime, extension: filename.split(".").pop()!, mediaType, checksumSha256: checksum ?? sha256(bytes), uploadedById: world.users.creator.id },
      { id: world.users.creator.id, name: "Creator" },
    );
  });
}

describe("file processing worker", () => {
  it("verifies integrity, extracts video metadata and stores a separate thumbnail", async () => {
    const video = await mp4Bytes(2, "320x180");
    const file = await storedFile(video, "clip.mp4", "video/mp4", "VIDEO");
    await processFile({ fileId: file.id });
    const after = await prisma.creativeFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(after.processingStatus).toBe("READY");
    expect(after.integrityStatus).toBe("VERIFIED");
    expect(after.verifiedSha256).toBe(sha256(video));
    expect([after.width, after.height]).toEqual([320, 180]);
    expect(after.durationSeconds).toBeGreaterThan(1.5);
    expect(after.videoCodec).toBe("h264");
    expect(after.thumbnailKey).toBeTruthy();
    expect((await headObject(after.thumbnailKey!))?.contentType).toBe("image/webp");
    // The original object is untouched.
    expect(sha256(await readObject(after.storageKey))).toBe(sha256(video));
  });

  it("extracts image dimensions without modifying the original", async () => {
    const png = await pngBytes(1200, 628);
    const file = await storedFile(png, "banner.png", "image/png", "IMAGE");
    await processFile({ fileId: file.id });
    const after = await prisma.creativeFile.findUniqueOrThrow({ where: { id: file.id } });
    expect([after.width, after.height]).toEqual([1200, 628]);
    expect(after.integrityStatus).toBe("VERIFIED");
    expect(after.thumbnailBytes).toBeGreaterThan(0);
    expect(sha256(await readObject(after.storageKey))).toBe(sha256(png));
  });

  it("flags a checksum mismatch and notifies the uploader", async () => {
    const png = await pngBytes();
    const file = await storedFile(png, "tampered.png", "image/png", "IMAGE", "0".repeat(64));
    await processFile({ fileId: file.id });
    const after = await prisma.creativeFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(after.integrityStatus).toBe("MISMATCH");
    const note = await prisma.notification.findFirstOrThrow({ where: { type: "INTEGRITY_FAILED" } });
    expect(note.userId).toBe(world.users.creator.id);
    expect(await prisma.activityLog.count({ where: { action: "FILE_INTEGRITY_FAILED" } })).toBe(1);
  });
});

describe("job queue", () => {
  it("claims each job once and retries failures with backoff", async () => {
    await prisma.job.create({ data: { type: "DELETE_OBJECTS", payload: { keys: [] }, maxAttempts: 2 } });
    const [a, b] = await Promise.all([claimJob("w1"), claimJob("w2")]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const job = (a ?? b)!;
    expect(await failJob(job, new Error("boom"))).toBe("retry");
    const queued = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(queued.status).toBe("QUEUED");
    expect(queued.runAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    const again = (await claimJob("w1"))!;
    expect(again.attempts).toBe(2);
    expect(await failJob(again, new Error("boom"))).toBe("failed");
    const third = await prisma.job.create({ data: { type: "DELETE_OBJECTS", payload: { keys: [] } } });
    const claimed = (await claimJob("w1"))!;
    expect(claimed.id).toBe(third.id);
    await completeJob(claimed.id);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: third.id } })).status).toBe("COMPLETED");
  });
});

describe("ZIP import", () => {
  it("rejects hostile entries, suggests applications from folders, pairs previews and imports byte-for-byte", async () => {
    const video = await mp4Bytes(1, "320x180");
    const preview = await mp4Bytes(1, "160x90");
    const png = await pngBytes(300, 200);
    const zip = buildZip([
      { name: "Beta/launch_teaser.mp4", data: video },
      { name: "Beta/launch_teaser_preview.mp4", data: preview },
      { name: "banners/hero.png", data: png, compress: true },
      { name: "../../etc/evil.png", data: png },
      { name: "/absolute/evil.png", data: png },
      { name: "secret.png", data: Buffer.from("/etc/passwd"), unixMode: 0o120777 },
      { name: "bomb.png", data: Buffer.alloc(30 * 1024 * 1024), compress: true },
      { name: "fake.jpg", data: Buffer.from("not an image at all") },
      { name: "notes.txt", data: Buffer.from("hello") },
      { name: "__MACOSX/._hero.png", data: Buffer.from("junk") },
    ]);
    const batch = await prisma.importBatch.create({
      data: { createdById: world.users.creator.id, applicationId: world.apps.alpha, archiveFilename: "legacy.zip", archiveSizeBytes: BigInt(zip.length), status: "ANALYZING" },
    });
    const key = importArchiveKey(batch.id, "legacy.zip");
    await putObject(key, zip, "application/zip");
    await prisma.importBatch.update({ where: { id: batch.id }, data: { archiveKey: key } });

    await analyzeImport({ batchId: batch.id });
    const analysed = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { items: true } });
    expect(analysed.status).toBe("READY_FOR_REVIEW");
    const byPath = Object.fromEntries(analysed.items.map((i) => [i.entryPath, i]));
    expect(Object.keys(byPath)).not.toContain("__MACOSX/._hero.png");
    expect(byPath["../../etc/evil.png"].rejectReason).toMatch(/traversal/i);
    expect(byPath["/absolute/evil.png"].rejectReason).toMatch(/absolute/i);
    expect(byPath["secret.png"].rejectReason).toMatch(/symbolic/i);
    expect(byPath["bomb.png"].rejectReason).toMatch(/zip bomb/i);
    expect(byPath["fake.jpg"].rejectReason).toMatch(/does not match/i);
    expect(byPath["notes.txt"].rejectReason).toMatch(/unsupported/i);

    const teaser = byPath["Beta/launch_teaser.mp4"];
    const teaserPreview = byPath["Beta/launch_teaser_preview.mp4"];
    expect(teaser.applicationId).toBe(world.apps.beta); // suggested from the folder name
    expect(teaser.suggestedApplicationId).toBe(world.apps.beta);
    expect(teaserPreview.versionType).toBe("PREVIEW");
    expect(teaserPreview.groupKey).toBe(teaser.groupKey);
    expect(byPath["banners/hero.png"].applicationId).toBe(world.apps.alpha); // default application

    // Confirm (as the review action does) and run.
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "IMPORTING" } });
    await runImport({ batchId: batch.id });
    const done = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(done.status).toBe("COMPLETED");
    expect(done.importedCount).toBe(3);
    expect(done.archiveKey).toBeNull(); // archive not kept by default

    const teaserCreative = await prisma.creative.findFirstOrThrow({ where: { name: "Launch teaser" }, include: { files: true } });
    expect(teaserCreative.applicationId).toBe(world.apps.beta);
    expect(teaserCreative.files.map((f) => f.versionType).sort()).toEqual(["FULL", "PREVIEW"]);
    const fullFile = teaserCreative.files.find((f) => f.versionType === "FULL")!;
    expect(sha256(await readObject(fullFile.storageKey))).toBe(sha256(video));
    expect(fullFile.checksumSha256).toBe(sha256(video));
    expect(await prisma.notification.count({ where: { type: "IMPORT_COMPLETED", userId: world.users.creator.id } })).toBe(1);
  });

  it("fails cleanly on something that is not a ZIP", async () => {
    const batch = await prisma.importBatch.create({
      data: { createdById: world.users.creator.id, applicationId: world.apps.alpha, archiveFilename: "broken.zip", archiveSizeBytes: 10n, status: "ANALYZING" },
    });
    const key = importArchiveKey(batch.id, "broken.zip");
    await putObject(key, Buffer.from("definitely not a zip archive"), "application/zip");
    await prisma.importBatch.update({ where: { id: batch.id }, data: { archiveKey: key } });
    await analyzeImport({ batchId: batch.id });
    const after = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(after.status).toBe("FAILED");
    expect(after.errorMessage).toMatch(/not a valid zip/i);
  });
});
