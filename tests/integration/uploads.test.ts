import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Association } from "@/lib/files/matching";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { headObject } from "@/lib/storage/s3";
import { abortUpload, completeUpload, computeParts, createUploadBatch, getUploadStatus, planUpload } from "@/server/services/uploads";
import { mp4Bytes, pngBytes, randomBytesOf, readObject, resetDatabase, seedWorld, sha256, uploadThroughSession, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

const fileInput = (name: string, bytes: Uint8Array, extra: { association: Association }) => ({
  clientId: name,
  name,
  size: bytes.length,
  lastModified: 1_700_000_000_000,
  versionType: name.includes("_preview") ? ("PREVIEW" as const) : ("FULL" as const),
  ...extra,
});

describe("upload planning", () => {
  it("detects _preview files and pairs them with the full version in the same batch", async () => {
    const plan = await planUpload(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [
        { clientId: "a", name: "summer_campaign.mp4", size: 1000 },
        { clientId: "b", name: "summer_campaign_preview.mp4", size: 100 },
        { clientId: "c", name: "notes.txt", size: 10 },
      ],
    });
    const byId = Object.fromEntries(plan.files.map((f) => [f.clientId, f]));
    expect(byId.a.versionType).toBe("FULL");
    expect(byId.b.versionType).toBe("PREVIEW");
    expect(byId.b.suggestion?.association).toEqual({ kind: "withFile", clientId: "a" });
    expect(byId.c.error).toMatch(/unsupported/i);
  });

  it("rejects files above the size limit", async () => {
    const plan = await planUpload(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [{ clientId: "big", name: "huge.mp4", size: 500 * 1024 * 1024 }],
    });
    expect(plan.files[0].error).toMatch(/limit/i);
  });

  it("enforces upload permissions and application access server-side", async () => {
    await expect(planUpload(world.users.viewer, { applicationId: world.apps.alpha, files: [{ clientId: "a", name: "x.png", size: 10 }] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(planUpload(world.users.restricted, { applicationId: world.apps.beta, files: [{ clientId: "a", name: "x.png", size: 10 }] })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses uploads to disabled applications", async () => {
    await prisma.application.update({ where: { id: world.apps.alpha }, data: { status: "DISABLED" } });
    await expect(planUpload(world.users.creator, { applicationId: world.apps.alpha, files: [{ clientId: "a", name: "x.png", size: 10 }] })).rejects.toThrow(/disabled/);
  });
});

describe("direct-to-storage uploads", () => {
  it("uploads a full + preview pair into ONE creative and preserves the original bytes", async () => {
    const full = await mp4Bytes(1, "320x180");
    const preview = await mp4Bytes(1, "160x90");
    const sessions = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      tags: ["summer"],
      channels: ["INSTAGRAM"],
      files: [
        fileInput("summer_campaign.mp4", full, { association: { kind: "new", groupKey: "g1" } }),
        fileInput("summer_campaign_preview.mp4", preview, { association: { kind: "withFile", clientId: "summer_campaign.mp4" } }),
      ],
    });
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map((s) => s.creativeId)).size).toBe(1);

    for (const [s, bytes] of [
      [sessions[0], full],
      [sessions[1], preview],
    ] as const) {
      await uploadThroughSession(world.users.creator, s, bytes);
      const res = await completeUpload(world.users.creator, s.sessionId, { sha256: sha256(bytes) });
      expect(res.kind).toBe("file");
    }

    const creative = await prisma.creative.findUniqueOrThrow({
      where: { id: sessions[0].creativeId },
      include: { files: true, tags: { include: { tag: true } } },
    });
    expect(creative.name).toBe("Summer campaign");
    expect(creative.status).toBe("DRAFT");
    expect(creative.channels).toEqual(["INSTAGRAM"]);
    expect(creative.tags.map((t) => t.tag.name)).toEqual(["summer"]);
    expect(creative.files.map((f) => f.versionType).sort()).toEqual(["FULL", "PREVIEW"]);

    const fullFile = creative.files.find((f) => f.versionType === "FULL")!;
    expect(fullFile.checksumSha256).toBe(sha256(full));
    // Stored object is byte-identical to the uploaded original.
    expect(sha256(await readObject(fullFile.storageKey))).toBe(sha256(full));

    const jobs = await prisma.job.findMany({ where: { type: "PROCESS_FILE" } });
    expect(jobs).toHaveLength(2);
    const activity = await prisma.activityLog.findMany({ where: { creativeId: creative.id }, orderBy: { createdAt: "asc" } });
    expect(activity.map((a) => a.action)).toEqual(["CREATIVE_CREATED", "VERSION_UPLOADED"]);
  });

  it("uses multipart uploads for large files and can resume from the parts already stored", async () => {
    const bytes = randomBytesOf(12 * 1024 * 1024 + 123); // 3 parts of 5 MiB
    // Make it a valid MP4 header-wise by prefixing a real MP4 header box.
    const header = (await mp4Bytes(1)).subarray(0, 64);
    header.copy(bytes, 0);
    const parts = computeParts(bytes.length);
    expect(parts.mode).toBe("MULTIPART");
    expect(parts.partCount).toBe(3);

    const [session] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("big_master.mp4", bytes, { association: { kind: "new", groupKey: "g" } })],
    });
    expect(session.mode).toBe("MULTIPART");

    // Interrupted after part 1…
    await uploadThroughSession(world.users.creator, session, bytes, { onlyParts: [1] });
    const status = await getUploadStatus(world.users.creator, session.sessionId);
    expect(status.uploadedParts.map((p) => p.partNumber)).toEqual([1]);
    await expect(completeUpload(world.users.creator, session.sessionId, {})).rejects.toThrow(/2 part/);

    // …resumed: only the missing parts are sent.
    await uploadThroughSession(world.users.creator, session, bytes, { onlyParts: [2, 3] });
    const done = await completeUpload(world.users.creator, session.sessionId, { sha256: sha256(bytes) });
    expect(done.kind).toBe("file");
    const file = await prisma.creativeFile.findFirstOrThrow({ where: { creativeId: session.creativeId } });
    expect(Number(file.sizeBytes)).toBe(bytes.length);
    expect(sha256(await readObject(file.storageKey))).toBe(sha256(bytes));
  });

  it("rejects files whose content does not match the extension and cleans up", async () => {
    const png = await pngBytes();
    const [session] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("fake_video.mp4", png, { association: { kind: "new", groupKey: "g" } })],
    });
    await uploadThroughSession(world.users.creator, session, png);
    await expect(completeUpload(world.users.creator, session.sessionId, {})).rejects.toThrow(/does not look like a valid/);
    expect(await headObject((await prisma.uploadSession.findUnique({ where: { id: session.sessionId } }))?.storageKey ?? "missing")).toBeNull();
    expect(await prisma.creative.count()).toBe(0);
  });

  it("rejects an upload whose stored size differs from the declared size", async () => {
    const png = await pngBytes();
    const [session] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [{ ...fileInput("banner.png", png, { association: { kind: "new", groupKey: "g" } }), size: png.length + 10 }],
    });
    await uploadThroughSession(world.users.creator, session, png);
    await expect(completeUpload(world.users.creator, session.sessionId, {})).rejects.toBeInstanceOf(AppError);
    expect(await prisma.creativeFile.count()).toBe(0);
  });

  it("cancels an upload and removes the empty creative", async () => {
    const bytes = randomBytesOf(11 * 1024 * 1024);
    const [session] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("clip.mp4", bytes, { association: { kind: "new", groupKey: "g" } })],
    });
    await uploadThroughSession(world.users.creator, session, bytes, { onlyParts: [1] });
    await abortUpload(world.users.creator, session.sessionId);
    expect((await prisma.uploadSession.findUnique({ where: { id: session.sessionId } }))?.status ?? "ABORTED").toBe("ABORTED");
    expect(await prisma.creative.count()).toBe(0);
  });

  it("does not let another user complete or inspect someone else's upload", async () => {
    const png = await pngBytes();
    const [session] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("banner.png", png, { association: { kind: "new", groupKey: "g" } })],
    });
    await expect(getUploadStatus(world.users.creator2, session.sessionId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(completeUpload(world.users.creator2, session.sessionId, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("links a preview uploaded first to its full version uploaded later", async () => {
    const preview = await pngBytes(32, 32);
    const [p] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("hero_banner_preview.png", preview, { association: { kind: "new", groupKey: "p" } })],
    });
    await uploadThroughSession(world.users.creator, p, preview);
    await completeUpload(world.users.creator, p.sessionId, {});

    const plan = await planUpload(world.users.creator, { applicationId: world.apps.alpha, files: [{ clientId: "f", name: "hero_banner.png", size: 1000 }] });
    expect(plan.files[0].suggestion?.association).toEqual({ kind: "existing", creativeId: p.creativeId });

    const full = await pngBytes(256, 128);
    const [f] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("hero_banner.png", full, { association: plan.files[0].suggestion!.association! })],
    });
    await uploadThroughSession(world.users.creator, f, full);
    await completeUpload(world.users.creator, f.sessionId, {});
    const files = await prisma.creativeFile.findMany({ where: { creativeId: p.creativeId } });
    expect(files.map((x) => x.versionType).sort()).toEqual(["FULL", "PREVIEW"]);
    expect(await prisma.creative.count()).toBe(1);
  });

  it("refuses to attach files to creatives the user may not edit", async () => {
    const png = await pngBytes();
    const [s] = await createUploadBatch(world.users.creator, {
      applicationId: world.apps.alpha,
      files: [fileInput("a.png", png, { association: { kind: "new", groupKey: "g" } })],
    });
    await uploadThroughSession(world.users.creator, s, png);
    await completeUpload(world.users.creator, s.sessionId, {});
    await expect(
      createUploadBatch(world.users.creator2, {
        applicationId: world.apps.alpha,
        files: [fileInput("a_preview.png", png, { association: { kind: "existing", creativeId: s.creativeId } })],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
