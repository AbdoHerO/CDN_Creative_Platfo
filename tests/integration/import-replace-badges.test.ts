import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { headObject, putObject } from "@/lib/storage/s3";
import { importArchiveKey, originalKey } from "@/lib/storage/keys";
import { ensureApplication } from "@/server/services/applications";
import { setCreativeBadges } from "@/server/services/badges";
import { attachFile, createCreativeRecord } from "@/server/services/creatives";
import { completeUpload, createUploadBatch } from "@/server/services/uploads";
import { analyzeImport, runImport } from "@/worker/handlers/imports";
import { buildZip } from "../support/zip-writer";
import { processFile } from "@/worker/handlers/process-file";
import { mp4Bytes, pdfBytes, pngBytes, resetDatabase, seedWorld, sha256, uploadThroughSession, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

async function creativeWithFile(name: string, bytes: Buffer, filename: string) {
  const creative = await prisma.$transaction((tx) =>
    createCreativeRecord(tx, {
      name,
      applicationId: world.apps.alpha,
      category: "MARKETING_VIDEO",
      matchKey: name.toLowerCase(),
      mediaType: "VIDEO",
      createdById: world.users.creator.id,
    }),
  );
  const fileId = newId();
  const key = originalKey(world.apps.alpha, creative.id, fileId, filename);
  await putObject(key, bytes, "video/mp4");
  const file = await prisma.$transaction((tx) =>
    attachFile(
      tx,
      {
        fileId,
        creativeId: creative.id,
        versionType: "FULL",
        originalFilename: filename,
        storageKey: key,
        sizeBytes: BigInt(bytes.length),
        mimeType: "video/mp4",
        extension: "mp4",
        mediaType: "VIDEO",
        checksumSha256: sha256(bytes),
        uploadedById: world.users.creator.id,
      },
      { id: world.users.creator.id, name: world.users.creator.name },
    ),
  );
  return { creative, file };
}

describe("data_creatives ZIP import", () => {
  it("maps platform folders, creates new platforms, pairs lite versions and never replaces existing creatives", async () => {
    const video = await mp4Bytes(1, "320x180");
    const lite = await mp4Bytes(1, "160x90");
    const banner = await pngBytes(300, 100);
    await prisma.badge.create({ data: { name: "3D", slug: "3d", color: "#F59E0B" } });
    // An existing creative with the same name as one of the archive's videos.
    const existing = await creativeWithFile("Spot 3d reel", video, "spot_3d_reel.mp4");

    const zip = buildZip([
      { name: "data_creatives/README.txt", data: Buffer.from("instructions") },
      { name: "data_creatives/alpha/videos/spot_3d_reel.mp4", data: video },
      { name: "data_creatives/alpha/videos/spot_3d_preview.mp4", data: lite },
      { name: "data_creatives/alpha/banners/hero.png", data: banner },
      { name: "data_creatives/alpha/pdf/user-guide.pdf", data: pdfBytes(3) },
      { name: "data_creatives/gamma/videos/launch-preview.mp4", data: lite },
      { name: "data_creatives/gamma/videos/launch.mp4", data: video },
    ]);
    const batch = await prisma.importBatch.create({
      data: { createdById: world.users.admin.id, applicationId: world.apps.beta, archiveFilename: "data_creatives.zip", archiveSizeBytes: BigInt(zip.length), status: "ANALYZING" },
    });
    const key = importArchiveKey(batch.id, "data_creatives.zip");
    await putObject(key, zip, "application/zip");
    await prisma.importBatch.update({ where: { id: batch.id }, data: { archiveKey: key } });

    await analyzeImport({ batchId: batch.id });
    const analysed = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id }, include: { items: true } });
    expect(analysed.status).toBe("READY_FOR_REVIEW");
    const byName = Object.fromEntries(analysed.items.map((i) => [i.filename, i]));
    expect(Object.keys(byName)).not.toContain("README.txt");

    // Platform folders → applications; "gamma" does not exist yet.
    expect(byName["spot_3d_reel.mp4"].applicationId).toBe(world.apps.alpha);
    expect(byName["hero.png"].category).toBe("BANNER");
    expect(byName["user-guide.pdf"].category).toBe("DOCUMENT");
    expect(byName["user-guide.pdf"].mediaType).toBe("DOCUMENT");
    expect(byName["launch.mp4"].applicationId).toBeNull();
    expect(byName["launch.mp4"].newApplicationName).toBe("gamma");
    // Lite versions pair with their full version (also "_reel" names), as new creatives only.
    expect(byName["spot_3d_preview.mp4"].versionType).toBe("PREVIEW");
    expect(byName["spot_3d_preview.mp4"].groupKey).toBe(byName["spot_3d_reel.mp4"].groupKey);
    expect(byName["launch-preview.mp4"].groupKey).toBe(byName["launch.mp4"].groupKey);
    expect(analysed.items.every((i) => i.targetCreativeId === null && !i.needsReview)).toBe(true);
    // Badges are pre-filled from file names; the review can change them (here: none for the banner, 3D removed from launch).
    const threeD = await prisma.badge.findUniqueOrThrow({ where: { slug: "3d" } });
    expect(byName["spot_3d_reel.mp4"].badgeIds).toEqual([threeD.id]);
    await prisma.importItem.update({ where: { id: byName["launch.mp4"].id }, data: { badgeIds: [] } });

    // Confirm as the review action does: create the new platform, then run.
    const gamma = await ensureApplication(prisma, "gamma");
    await prisma.importItem.updateMany({ where: { batchId: batch.id, newApplicationName: "gamma" }, data: { applicationId: gamma.id } });
    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "IMPORTING" } });
    await runImport({ batchId: batch.id });
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).importedCount).toBe(6);

    // The worker reads the page count and renders the first page as thumbnail.
    const guide = await prisma.creativeFile.findFirstOrThrow({ where: { originalFilename: "user-guide.pdf" } });
    await processFile({ fileId: guide.id });
    const processed = await prisma.creativeFile.findUniqueOrThrow({ where: { id: guide.id } });
    expect(processed.pageCount).toBe(3);
    expect(processed.processingStatus).toBe("READY");
    expect(processed.thumbnailKey).toBeTruthy();

    const alphaCreatives = await prisma.creative.findMany({
      where: { applicationId: world.apps.alpha },
      include: { files: true, badges: { include: { badge: true } } },
      orderBy: { createdAt: "asc" },
    });
    expect(alphaCreatives.map((c) => c.name).sort()).toEqual(["Hero", "Spot 3d reel", "Spot 3d reel (2)", "User guide"]);
    const imported = alphaCreatives.find((c) => c.name === "Spot 3d reel (2)")!;
    expect(imported.files.map((f) => f.versionType).sort()).toEqual(["FULL", "PREVIEW"]);
    expect(imported.badges.map((b) => b.badge.name)).toEqual(["3D"]);
    expect(alphaCreatives.find((c) => c.id === existing.creative.id)!.files).toHaveLength(1); // untouched

    const gammaCreative = await prisma.creative.findFirstOrThrow({ where: { applicationId: gamma.id }, include: { files: true } });
    expect(gammaCreative.name).toBe("Launch");
    expect(gammaCreative.files).toHaveLength(2);
  });

  it("reuses an application whose name matches a folder written differently", async () => {
    await prisma.application.create({ data: { name: "Win+Pharma", slug: "win-pharma" } });
    const again = await ensureApplication(prisma, "win+pharma");
    expect(again.created).toBe(false);
    expect(await prisma.application.count({ where: { name: { contains: "Pharma" } } })).toBe(1);
  });
});

describe("replacing a file", () => {
  it("deletes the old file, frees its storage and keeps the version number", async () => {
    const oldBytes = await mp4Bytes(1, "320x180");
    const { creative, file: old } = await creativeWithFile("Promo", oldBytes, "promo.mp4");
    const newBytes = await mp4Bytes(2, "320x180");

    const [session] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [
        {
          clientId: "r",
          name: "promo_final.mp4",
          size: newBytes.length,
          lastModified: 1,
          versionType: "FULL",
          association: { kind: "existing", creativeId: creative.id },
          replaceFileId: old.id,
        },
      ],
    });
    await uploadThroughSession(world.users.creator, session, newBytes);
    const done = await completeUpload(world.users.creator, session.sessionId, { sha256: sha256(newBytes) });

    const files = await prisma.creativeFile.findMany({ where: { creativeId: creative.id } });
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe(done.kind === "file" ? done.fileId : "");
    expect(files[0].originalFilename).toBe("promo_final.mp4");
    expect(files[0].versionNumber).toBe(1);
    expect(files[0].isCurrent).toBe(true);
    expect(await prisma.creativeFile.findUnique({ where: { id: old.id } })).toBeNull();

    const deletion = await prisma.job.findFirstOrThrow({ where: { type: "DELETE_OBJECTS" } });
    expect((deletion.payload as { keys: string[] }).keys).toContain(old.storageKey);
    expect(await headObject(files[0].storageKey)).not.toBeNull();
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: "FILE_REPLACED" } });
    expect(log.summary).toMatch(/promo\.mp4.*promo_final\.mp4/);
  });

  it("only accepts the same kind of media", async () => {
    const { creative, file } = await creativeWithFile("Clip", await mp4Bytes(1), "clip.mp4");
    const png = await pngBytes();
    await expect(
      createUploadBatch(world.users.creator, {
        applicationId: world.apps.alpha,
        files: [
          {
            clientId: "r",
            name: "clip.png",
            size: png.length,
            lastModified: 1,
            versionType: "FULL",
            association: { kind: "existing", creativeId: creative.id },
            replaceFileId: file.id,
          },
        ],
      }),
    ).rejects.toThrow(/choose a video/i);
  });
});

describe("badges", () => {
  it("lets editors switch badges and refuses viewers", async () => {
    const { creative } = await creativeWithFile("Teaser", await mp4Bytes(1), "teaser.mp4");
    const [motion, hf] = await Promise.all([
      prisma.badge.create({ data: { name: "Motion graphique", slug: "motion-graphique", color: "#8B5CF6" } }),
      prisma.badge.create({ data: { name: "Higgsfield", slug: "higgsfield", color: "#0EA5E9" } }),
    ]);
    await setCreativeBadges(world.users.creator, creative.id, [motion.id, hf.id]);
    expect(await prisma.creativeBadge.count({ where: { creativeId: creative.id } })).toBe(2);
    await setCreativeBadges(world.users.manager, creative.id, [hf.id]);
    const left = await prisma.creativeBadge.findMany({ where: { creativeId: creative.id }, include: { badge: true } });
    expect(left.map((b) => b.badge.name)).toEqual(["Higgsfield"]);
    await expect(setCreativeBadges(world.users.viewer, creative.id, [])).rejects.toBeInstanceOf(ForbiddenError);
  });
});
