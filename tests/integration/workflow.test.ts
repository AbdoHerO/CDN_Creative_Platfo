import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { creativeVisibilityWhere } from "@/lib/visibility";
import { WorkflowError } from "@/lib/workflow";
import { attachFile, createCreativeRecord } from "@/server/services/creatives";
import { actionableCreativeIds, countActionableCreatives } from "@/server/queries/library";
import { bulkTransition, transitionCreative } from "@/server/services/validation";
import { resetDatabase, seedWorld, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

/** Register a creative with an already-stored file (no network needed for workflow tests). */
async function creativeWithFile(ownerId: string, opts: { versionType?: "FULL" | "PREVIEW"; applicationId?: string; name?: string } = {}) {
  return prisma.$transaction(async (tx) => {
    const c = await createCreativeRecord(tx, {
      name: opts.name ?? "Spring promo",
      applicationId: opts.applicationId ?? world.apps.alpha,
      category: "MARKETING_VIDEO",
      matchKey: "spring_promo",
      mediaType: "VIDEO",
      createdById: ownerId,
    });
    const fileId = newId();
    await attachFile(
      tx,
      {
        fileId,
        creativeId: c.id,
        versionType: opts.versionType ?? "FULL",
        originalFilename: "spring_promo.mp4",
        storageKey: `test/${fileId}.mp4`,
        sizeBytes: 1000n,
        mimeType: "video/mp4",
        extension: "mp4",
        mediaType: "VIDEO",
        uploadedById: ownerId,
      },
      { id: ownerId, name: "Owner" },
    );
    return c;
  });
}

describe("validation workflow", () => {
  it("submits several creatives at once and skips those that cannot be submitted, with one notification per reviewer", async () => {
    const { creator, creator2 } = world.users;
    const draft = await creativeWithFile(creator.id, { name: "Draft A" });
    const pending = await creativeWithFile(creator.id, { name: "Already pending" });
    await transitionCreative(creator, pending.id, "submit", {});
    const previewOnly = await creativeWithFile(creator.id, { name: "Preview only", versionType: "PREVIEW" });
    const someoneElse = await creativeWithFile(creator2.id, { name: "Not mine" });

    const before = await prisma.notification.count();
    const res = await bulkTransition(creator, [draft.id, pending.id, previewOnly.id, someoneElse.id, draft.id, "missing-id"], "submit");
    expect(res).toEqual({ done: 1, skipped: 4 });
    // admin + manager, one each.
    expect(await prisma.notification.count()).toBe(before + 2);
    const statuses = await prisma.creative.findMany({ where: { id: { in: [draft.id, previewOnly.id, someoneElse.id] } }, select: { name: true, status: true } });
    expect(Object.fromEntries(statuses.map((c) => [c.name, c.status]))).toEqual({ "Draft A": "PENDING", "Preview only": "DRAFT", "Not mine": "DRAFT" });
  });

  it("reviewers approve in bulk, drafts included, with the full history and one summary notification", async () => {
    const { creator, manager } = world.users;
    const draft = await creativeWithFile(creator.id, { name: "Draft" });
    const pending = await creativeWithFile(creator.id, { name: "Pending" });
    await transitionCreative(creator, pending.id, "submit", {});
    const approved = await creativeWithFile(creator.id, { name: "Already approved" });
    await transitionCreative(creator, approved.id, "submit", {});
    await transitionCreative(manager, approved.id, "approve", {});
    await expect(bulkTransition(creator, [draft.id], "approve")).rejects.toBeInstanceOf(ForbiddenError);

    const before = await prisma.notification.count({ where: { userId: creator.id } });
    expect(await bulkTransition(manager, [draft.id, pending.id, approved.id], "approve")).toEqual({ done: 2, skipped: 1 });
    const statuses = await prisma.creative.findMany({ where: { id: { in: [draft.id, pending.id] } }, select: { status: true } });
    expect(statuses.map((c) => c.status)).toEqual(["APPROVED", "APPROVED"]);
    const history = await prisma.validation.findMany({ where: { creativeId: draft.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => h.action)).toEqual(["SUBMITTED", "REVIEW_STARTED", "APPROVED"]);
    const notes = await prisma.notification.findMany({ where: { userId: creator.id }, orderBy: { createdAt: "desc" } });
    expect(notes.length).toBe(before + 1);
    expect(notes[0]).toMatchObject({ type: "CREATIVE_APPROVED", title: "2 of your creatives were approved", link: "/approved" });
  });

  it("finds every creative of a validation tab across pages, scoped like the queue", async () => {
    const { creator, creator2, manager } = world.users;
    for (const name of ["Spot A", "Spot B", "Spot C"]) await creativeWithFile(creator.id, { name });
    await creativeWithFile(creator2.id, { name: "Spot of someone else" });
    await creativeWithFile(creator.id, { name: "Lite only", versionType: "PREVIEW" });
    expect(await countActionableCreatives(manager, { kind: "all" }, "DRAFT")).toBe(4);
    expect(await countActionableCreatives(creator, { kind: "all", uploader: creator.id }, "DRAFT")).toBe(3);
    expect(await countActionableCreatives(manager, { kind: "all", q: "someone" }, "DRAFT")).toBe(1);
    const ids = await actionableCreativeIds(creator, { kind: "all", uploader: creator.id }, "DRAFT", 500);
    expect(await bulkTransition(creator, ids, "submit")).toEqual({ done: 3, skipped: 0 });
    expect(await countActionableCreatives(manager, { kind: "all" }, "PENDING")).toBe(3);
  });

  it("creator submits, reviewers are notified, manager approves with a full history", async () => {
    const { creator, manager, admin } = world.users;
    const c = await creativeWithFile(creator.id);

    await transitionCreative(creator, c.id, "submit", { comment: "Ready for review" });
    expect((await prisma.creative.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
    const submittedNotifications = await prisma.notification.findMany({ where: { type: "CREATIVE_SUBMITTED" } });
    expect(submittedNotifications.map((n) => n.userId).sort()).toEqual([admin.id, manager.id].sort());

    await expect(transitionCreative(creator, c.id, "approve", {})).rejects.toBeInstanceOf(ForbiddenError);

    await transitionCreative(manager, c.id, "approve", { comment: "Looks great" });
    const after = await prisma.creative.findUniqueOrThrow({ where: { id: c.id }, include: { validations: { orderBy: { createdAt: "asc" } } } });
    expect(after.status).toBe("APPROVED");
    expect(after.approvedAt).not.toBeNull();
    expect(after.validations.map((v) => [v.action, v.fromStatus, v.toStatus])).toEqual([
      ["SUBMITTED", "DRAFT", "PENDING"],
      ["REVIEW_STARTED", "PENDING", "IN_REVIEW"],
      ["APPROVED", "IN_REVIEW", "APPROVED"],
    ]);
    expect(after.validations[2].reviewerId).toBe(manager.id);
    expect(after.validations[2].comment).toBe("Looks great");
    expect(after.validations[2].fileId).not.toBeNull();

    const approvedNote = await prisma.notification.findFirstOrThrow({ where: { type: "CREATIVE_APPROVED" } });
    expect(approvedNote.userId).toBe(creator.id);
    expect(await prisma.activityLog.count({ where: { action: "CREATIVE_APPROVED", creativeId: c.id } })).toBe(1);
  });

  it("requires a reason to decline, notifies the creator, and allows resubmission", async () => {
    const { creator, manager } = world.users;
    const c = await creativeWithFile(creator.id);
    await transitionCreative(creator, c.id, "submit", {});
    await transitionCreative(manager, c.id, "startReview", {});

    await expect(transitionCreative(manager, c.id, "decline", { comment: "" })).rejects.toBeInstanceOf(WorkflowError);
    await transitionCreative(manager, c.id, "decline", { comment: "Legal mention missing" });
    const declined = await prisma.creative.findUniqueOrThrow({ where: { id: c.id }, include: { validations: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(declined.status).toBe("DECLINED");
    expect(declined.validations[0].reason).toBe("Legal mention missing");
    const note = await prisma.notification.findFirstOrThrow({ where: { type: "CREATIVE_DECLINED" } });
    expect(note.userId).toBe(creator.id);
    expect(note.body).toContain("Legal mention missing");

    await transitionCreative(creator, c.id, "submit", { comment: "Fixed" });
    expect((await prisma.creative.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("PENDING");
  });

  it("request changes sends the creative back to draft with a comment", async () => {
    const { creator, manager } = world.users;
    const c = await creativeWithFile(creator.id);
    await transitionCreative(creator, c.id, "submit", {});
    await transitionCreative(manager, c.id, "requestChanges", { comment: "Shorten the intro" });
    expect((await prisma.creative.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("DRAFT");
    expect((await prisma.notification.findFirstOrThrow({ where: { type: "CHANGES_REQUESTED" } })).userId).toBe(creator.id);
  });

  it("cannot submit a creative without a full version", async () => {
    const c = await creativeWithFile(world.users.creator.id, { versionType: "PREVIEW" });
    await expect(transitionCreative(world.users.creator, c.id, "submit", {})).rejects.toThrow(/full version/);
  });

  it("archives and restores to the previous status", async () => {
    const { creator, manager } = world.users;
    const c = await creativeWithFile(creator.id);
    await transitionCreative(creator, c.id, "submit", {});
    await transitionCreative(manager, c.id, "approve", {});
    await expect(transitionCreative(creator, c.id, "archive", {})).rejects.toBeInstanceOf(ForbiddenError);
    await transitionCreative(manager, c.id, "archive", {});
    expect((await prisma.creative.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("ARCHIVED");
    await transitionCreative(manager, c.id, "restore", {});
    expect((await prisma.creative.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("APPROVED");
  });

  it("returns an approved creative to draft when a new full version is uploaded", async () => {
    const { creator, manager } = world.users;
    const c = await creativeWithFile(creator.id);
    await transitionCreative(creator, c.id, "submit", {});
    await transitionCreative(manager, c.id, "approve", {});
    const fileId = newId();
    await prisma.$transaction((tx) =>
      attachFile(
        tx,
        { fileId, creativeId: c.id, versionType: "FULL", originalFilename: "spring_promo_v2.mp4", storageKey: `test/${fileId}.mp4`, sizeBytes: 2000n, mimeType: "video/mp4", extension: "mp4", mediaType: "VIDEO", uploadedById: manager.id },
        { id: manager.id, name: "Manager" },
      ),
    );
    const after = await prisma.creative.findUniqueOrThrow({ where: { id: c.id }, include: { files: true, validations: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(after.status).toBe("DRAFT");
    expect(after.validations[0].action).toBe("RESET_NEW_VERSION");
    const fulls = after.files.filter((f) => f.versionType === "FULL").sort((a, b) => a.versionNumber - b.versionNumber);
    expect(fulls.map((f) => [f.versionNumber, f.isCurrent])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("does not let a manager without access to an application review its creatives", async () => {
    const c = await creativeWithFile(world.users.creator.id, { applicationId: world.apps.beta });
    await transitionCreative(world.users.creator, c.id, "submit", {});
    const restrictedManager = { ...world.users.manager, restrictApplications: true, applicationIds: [world.apps.alpha] };
    await expect(transitionCreative(restrictedManager, c.id, "approve", {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("visibility scoping in queries", () => {
  it("viewers only list approved creatives; creators do not see other people's drafts", async () => {
    const { creator, creator2, manager, viewer } = world.users;
    const mine = await creativeWithFile(creator.id, { name: "Mine draft" });
    const other = await creativeWithFile(creator2.id, { name: "Other draft" });
    const approved = await creativeWithFile(creator2.id, { name: "Approved one" });
    await transitionCreative(creator2, approved.id, "submit", {});
    await transitionCreative(manager, approved.id, "approve", {});

    const names = async (u: typeof creator) =>
      (await prisma.creative.findMany({ where: creativeVisibilityWhere(u), select: { name: true } })).map((c) => c.name).sort();

    expect(await names(viewer)).toEqual(["Approved one"]);
    expect(await names(creator)).toEqual(["Approved one", "Mine draft"]);
    expect(await names(manager)).toEqual(["Approved one", "Mine draft", "Other draft"]);
    expect(mine.id).not.toBe(other.id);
  });

  it("application restrictions apply to every query", async () => {
    await creativeWithFile(world.users.creator.id, { applicationId: world.apps.beta, name: "Beta creative" });
    const visible = await prisma.creative.findMany({ where: creativeVisibilityWhere(world.users.restricted) });
    expect(visible).toHaveLength(0);
  });
});
