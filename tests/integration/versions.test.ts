import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { attachFile, createCreativeRecord, deleteCreative, deleteFile, moveFile, setCurrentFile, updateCreativeMetadata } from "@/server/services/creatives";
import { resetDatabase, seedWorld, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

async function newCreative(ownerId: string, name = "Launch teaser", matchKey = "launch_teaser") {
  return prisma.$transaction((tx) =>
    createCreativeRecord(tx, { name, applicationId: world.apps.alpha, category: "MARKETING_VIDEO", matchKey, mediaType: "VIDEO", createdById: ownerId }),
  );
}

async function addFile(creativeId: string, versionType: "FULL" | "PREVIEW" | "VARIANT", name: string, uploaderId: string) {
  const fileId = newId();
  return prisma.$transaction((tx) =>
    attachFile(
      tx,
      {
        fileId,
        creativeId,
        versionType,
        originalFilename: name,
        storageKey: `test/${fileId}/${name}`,
        sizeBytes: BigInt(name.length * 1000),
        mimeType: "video/mp4",
        extension: "mp4",
        mediaType: "VIDEO",
        uploadedById: uploaderId,
      },
      { id: uploaderId, name: "Uploader" },
    ),
  );
}

describe("version management", () => {
  it("numbers versions per type and keeps exactly one current version per type", async () => {
    const c = await newCreative(world.users.creator.id);
    await addFile(c.id, "FULL", "teaser.mp4", world.users.creator.id);
    await addFile(c.id, "PREVIEW", "teaser_preview.mp4", world.users.creator.id);
    await addFile(c.id, "FULL", "teaser_v2.mp4", world.users.creator.id);
    const files = await prisma.creativeFile.findMany({ where: { creativeId: c.id }, orderBy: [{ versionType: "asc" }, { versionNumber: "asc" }] });
    expect(files.map((f) => [f.versionType, f.versionNumber, f.isCurrent])).toEqual([
      ["FULL", 1, false],
      ["FULL", 2, true],
      ["PREVIEW", 1, true],
    ]);
  });

  it("can make an older version current again", async () => {
    const c = await newCreative(world.users.creator.id);
    const v1 = await addFile(c.id, "FULL", "a.mp4", world.users.creator.id);
    await addFile(c.id, "FULL", "b.mp4", world.users.creator.id);
    await setCurrentFile(world.users.creator, v1.id);
    const current = await prisma.creativeFile.findMany({ where: { creativeId: c.id, isCurrent: true } });
    expect(current.map((f) => f.id)).toEqual([v1.id]);
  });

  it("deleting the current version promotes the previous one and queues object deletion", async () => {
    const c = await newCreative(world.users.creator.id);
    const v1 = await addFile(c.id, "FULL", "a.mp4", world.users.creator.id);
    const v2 = await addFile(c.id, "FULL", "b.mp4", world.users.creator.id);
    await deleteFile(world.users.creator, v2.id);
    expect((await prisma.creativeFile.findUniqueOrThrow({ where: { id: v1.id } })).isCurrent).toBe(true);
    const job = await prisma.job.findFirstOrThrow({ where: { type: "DELETE_OBJECTS" } });
    expect((job.payload as { keys: string[] }).keys).toContain(v2.storageKey);
  });

  it("refuses to delete the only file of a creative", async () => {
    const c = await newCreative(world.users.creator.id);
    const v1 = await addFile(c.id, "FULL", "a.mp4", world.users.creator.id);
    await expect(deleteFile(world.users.creator, v1.id)).rejects.toThrow(/only file/);
  });

  it("links an unmatched preview to its full creative and removes the empty preview-only creative", async () => {
    const full = await newCreative(world.users.creator.id, "Hero", "hero");
    await addFile(full.id, "FULL", "hero.mp4", world.users.creator.id);
    const orphan = await newCreative(world.users.creator.id, "Hero preview", "hero");
    const preview = await addFile(orphan.id, "PREVIEW", "hero_preview.mp4", world.users.creator.id);

    const res = await moveFile(world.users.creator, preview.id, full.id, undefined);
    expect(res.sourceDeleted).toBe(true);
    expect(await prisma.creative.findUnique({ where: { id: orphan.id } })).toBeNull();
    const moved = await prisma.creativeFile.findUniqueOrThrow({ where: { id: preview.id } });
    expect(moved.creativeId).toBe(full.id);
    expect(moved.versionType).toBe("PREVIEW");
    expect(await prisma.activityLog.count({ where: { action: "FILE_MOVED" } })).toBe(1);
  });

  it("protects other users' creatives", async () => {
    const c = await newCreative(world.users.creator.id);
    const v1 = await addFile(c.id, "FULL", "a.mp4", world.users.creator.id);
    await addFile(c.id, "FULL", "b.mp4", world.users.creator.id);
    await expect(deleteFile(world.users.creator2, v1.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCurrentFile(world.users.viewer, v1.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("updates metadata with tags and keywords and records the changed fields", async () => {
    const c = await newCreative(world.users.creator.id);
    await addFile(c.id, "FULL", "a.mp4", world.users.creator.id);
    await updateCreativeMetadata(world.users.creator, c.id, {
      name: "Launch teaser 2026",
      description: "Teaser for the product launch",
      category: "ADVERTISING_VIDEO",
      channels: ["YOUTUBE"],
      keywords: ["Launch", "teaser"],
      tags: ["launch", "Video"],
    });
    const after = await prisma.creative.findUniqueOrThrow({ where: { id: c.id }, include: { tags: { include: { tag: true } } } });
    expect(after.name).toBe("Launch teaser 2026");
    expect(after.keywords).toEqual(["launch", "teaser"]);
    expect(after.tags.map((t) => t.tag.name).sort()).toEqual(["launch", "video"]);
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: "CREATIVE_UPDATED" } });
    expect((log.metadata as { changed: string[] }).changed).toEqual(expect.arrayContaining(["name", "category", "tags", "keywords"]));
  });

  it("only admins can delete arbitrary creatives; deletion queues all objects and keeps the audit trail", async () => {
    const c = await newCreative(world.users.creator.id);
    const f1 = await addFile(c.id, "FULL", "a.mp4", world.users.creator.id);
    const f2 = await addFile(c.id, "PREVIEW", "a_preview.mp4", world.users.creator.id);
    await prisma.creative.update({ where: { id: c.id }, data: { submittedAt: new Date() } });
    await expect(deleteCreative(world.users.manager, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteCreative(world.users.creator, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteCreative(world.users.admin, c.id);
    expect(await prisma.creative.count()).toBe(0);
    const job = await prisma.job.findFirstOrThrow({ where: { type: "DELETE_OBJECTS" } });
    expect((job.payload as { keys: string[] }).keys).toEqual(expect.arrayContaining([f1.storageKey, f2.storageKey]));
    const log = await prisma.activityLog.findFirstOrThrow({ where: { action: "CREATIVE_DELETED" } });
    expect(log.summary).toContain("Launch teaser");
  });
});
