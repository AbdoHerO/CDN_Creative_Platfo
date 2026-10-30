import { beforeEach, describe, expect, it } from "vitest";
import type { CreativeCategory, MediaType, VersionType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/ids";
import { attachFile, createCreativeRecord } from "@/server/services/creatives";
import { transitionCreative } from "@/server/services/validation";
import { libraryCounts, parseLibraryParams, queryLibrary } from "@/server/queries/library";
import { resetDatabase, seedWorld, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

async function make(opts: {
  name: string;
  app?: string;
  category?: CreativeCategory;
  mediaType?: MediaType;
  files: { name: string; type: VersionType; size: number }[];
  tags?: string[];
  keywords?: string[];
  campaignId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const c = await createCreativeRecord(tx, {
      name: opts.name,
      applicationId: opts.app ?? world.apps.alpha,
      campaignId: opts.campaignId ?? null,
      category: opts.category ?? "MARKETING_VIDEO",
      matchKey: opts.name.toLowerCase().replace(/\W+/g, "_"),
      mediaType: opts.mediaType ?? "VIDEO",
      tags: opts.tags,
      keywords: opts.keywords,
      createdById: world.users.creator.id,
    });
    for (const f of opts.files) {
      const fileId = newId();
      await attachFile(
        tx,
        {
          fileId,
          creativeId: c.id,
          versionType: f.type,
          originalFilename: f.name,
          storageKey: `test/${fileId}`,
          sizeBytes: BigInt(f.size),
          mimeType: opts.mediaType === "IMAGE" ? "image/png" : "video/mp4",
          extension: f.name.split(".").pop()!,
          mediaType: opts.mediaType ?? "VIDEO",
          uploadedById: world.users.creator.id,
        },
        { id: world.users.creator.id, name: "Creator" },
      );
    }
    return c;
  });
}

// These scenarios cover every content type; the library itself opens on videos.
const run = (params: Record<string, string>, showPreviews = false, user = world.users.admin) =>
  queryLibrary(user, parseLibraryParams({ kind: "all", ...params }), { pageSize: 24, showPreviews });

describe("creative library", () => {
  beforeEach(async () => {
    const campaign = await prisma.campaign.create({ data: { name: "Summer Campaign", slug: "summer-campaign", applicationId: world.apps.beta } });
    await make({ name: "Summer teaser", app: world.apps.beta, campaignId: campaign.id, tags: ["summer"], files: [{ name: "summer_teaser.mp4", type: "FULL", size: 180_000_000 }, { name: "summer_teaser_preview.mp4", type: "PREVIEW", size: 11_000_000 }] });
    await make({ name: "Winter banner", category: "BANNER", mediaType: "IMAGE", keywords: ["snow"], files: [{ name: "winter_banner.png", type: "FULL", size: 2_000_000 }] });
    await make({ name: "Orphan preview", files: [{ name: "orphan_preview.mp4", type: "PREVIEW", size: 9_000_000 }] });
    const approved = await make({ name: "Approved promo", files: [{ name: "approved_promo.mp4", type: "FULL", size: 50_000_000 }] });
    await transitionCreative(world.users.creator, approved.id, "submit", {});
    await transitionCreative(world.users.manager, approved.id, "approve", {});
  });

  it("hides preview versions by default and lists them, labelled, when enabled", async () => {
    const hidden = await run({});
    expect(hidden.items.map((i) => i.name).sort()).toEqual(["Approved promo", "Summer teaser", "Winter banner"]);
    expect(hidden.items.every((i) => i.versionType === "FULL")).toBe(true);

    const shown = await run({}, true);
    expect(shown.total).toBe(5);
    const previews = shown.items.filter((i) => i.versionType === "PREVIEW").map((i) => i.originalFilename).sort();
    expect(previews).toEqual(["orphan_preview.mp4", "summer_teaser_preview.mp4"]);
    const teaser = hidden.items.find((i) => i.name === "Summer teaser")!;
    expect(teaser.versions).toEqual({ full: 1, preview: 1, variant: 0 });
  });

  it("combines filters (application + type + status + campaign)", async () => {
    const res = await run({ app: world.apps.beta, type: "VIDEO", status: "DRAFT", campaign: (await prisma.campaign.findFirstOrThrow()).id });
    expect(res.items.map((i) => i.name)).toEqual(["Summer teaser"]);
    expect((await run({ status: "APPROVED" })).items.map((i) => i.name)).toEqual(["Approved promo"]);
    expect((await run({ category: "BANNER" })).items.map((i) => i.name)).toEqual(["Winter banner"]);
    expect((await run({ app: world.apps.beta, category: "BANNER" })).total).toBe(0);
  });

  it("searches names, filenames, tags, keywords, campaigns and applications — every token must match", async () => {
    const names = async (q: string) => (await run({ q })).items.map((i) => i.name).sort();
    expect(await names("teaser")).toEqual(["Summer teaser"]);
    expect(await names("summer_teaser_preview")).toEqual(["Summer teaser"]); // filename of any version
    expect(await names("snow")).toEqual(["Winter banner"]); // keyword
    expect(await names("Beta summer")).toEqual(["Summer teaser"]); // application + campaign/tag
    expect(await names("alpha")).toEqual(["Approved promo", "Winter banner"]);
    expect(await names("winter teaser")).toEqual([]);
  });

  it("sorts by size and name", async () => {
    expect((await run({ sort: "largest" })).items.map((i) => i.name)).toEqual(["Summer teaser", "Approved promo", "Winter banner"]);
    expect((await run({ sort: "smallest" })).items[0].name).toBe("Winter banner");
    expect((await run({ sort: "name" })).items.map((i) => i.name)).toEqual(["Approved promo", "Summer teaser", "Winter banner"]);
  });

  it("paginates", async () => {
    const page = await queryLibrary(world.users.admin, parseLibraryParams({ kind: "all", size: "24" }), { pageSize: 24, showPreviews: true });
    expect(page.total).toBe(5);
    const p2 = await queryLibrary(world.users.admin, { ...parseLibraryParams({ kind: "all", page: "2" }), size: undefined }, { pageSize: 2, showPreviews: true });
    expect(p2.items).toHaveLength(2);
    expect(p2.page).toBe(2);
  });

  it("scopes results to what the user may see", async () => {
    expect((await run({}, false, world.users.viewer)).items.map((i) => i.name)).toEqual(["Approved promo"]);
    expect((await run({}, false, world.users.creator2)).items.map((i) => i.name)).toEqual(["Approved promo"]);
    expect((await run({}, false, world.users.restricted)).items.map((i) => i.name)).toEqual(["Approved promo"]);
  });

  it("ignores malformed parameters instead of failing", () => {
    const p = parseLibraryParams({ status: "NOPE", sort: "random", page: "-4", app: "'; drop table", size: "1000" });
    expect(p).toMatchObject({ status: undefined, sort: "newest", page: 1, app: undefined, size: undefined });
  });
});

describe("library banner filters", () => {
  it("filters by validation state and lite version, with matching counts", async () => {
    const approved = await make({ name: "Approved spot", files: [{ name: "a.mp4", type: "FULL", size: 10 }, { name: "a_preview.mp4", type: "PREVIEW", size: 2 }] });
    await transitionCreative(world.users.creator, approved.id, "submit", {});
    await transitionCreative(world.users.manager, approved.id, "approve", {});
    await make({ name: "Draft spot", files: [{ name: "b.mp4", type: "FULL", size: 10 }] });
    await make({ name: "Beta draft", app: world.apps.beta, files: [{ name: "c.mp4", type: "FULL", size: 10 }, { name: "c_preview.mp4", type: "PREVIEW", size: 2 }] });

    const names = async (q: Record<string, string>) =>
      (await queryLibrary(world.users.admin, parseLibraryParams(q), { pageSize: 50, showPreviews: false })).items.map((i) => i.name).sort();
    expect(await names({ review: "approved" })).toEqual(["Approved spot"]);
    expect(await names({ review: "waiting" })).toEqual(["Beta draft", "Draft spot"]);
    expect(await names({ lite: "with" })).toEqual(["Approved spot", "Beta draft"]);
    expect(await names({ lite: "without" })).toEqual(["Draft spot"]);
    expect(await names({ lite: "with", app: world.apps.beta })).toEqual(["Beta draft"]);

    const items = (await queryLibrary(world.users.admin, parseLibraryParams({}), { pageSize: 50, showPreviews: false })).items;
    expect(items.find((i) => i.name === "Approved spot")!.hasPreview).toBe(true);
    expect(items.find((i) => i.name === "Draft spot")!.hasPreview).toBe(false);

    const counts = await libraryCounts(world.users.admin, parseLibraryParams({ app: world.apps.alpha }));
    expect(counts.apps).toEqual({ [world.apps.alpha]: 2, [world.apps.beta]: 1 }); // platform counts ignore the selected platform
    expect(counts.review).toEqual({ all: 2, approved: 1, waiting: 1, declined: 0 });
    expect(counts.lite).toEqual({ all: 2, with: 1, without: 1 });
  });
});

describe("content tabs", () => {
  it("opens on videos and switches to banners, PDFs or everything", async () => {
    await make({ name: "Spot", files: [{ name: "spot.mp4", type: "FULL", size: 10 }] });
    await make({ name: "Hero banner", mediaType: "IMAGE", category: "BANNER", files: [{ name: "hero.png", type: "FULL", size: 10 }] });
    await make({ name: "User guide", mediaType: "DOCUMENT", category: "DOCUMENT", files: [{ name: "guide.pdf", type: "FULL", size: 10 }] });
    const names = async (q: Record<string, string>) =>
      (await queryLibrary(world.users.admin, parseLibraryParams(q), { pageSize: 50, showPreviews: false })).items.map((i) => i.name).sort();
    expect(parseLibraryParams({}).kind).toBe("video");
    expect(await names({})).toEqual(["Spot"]);
    expect(await names({ kind: "banner" })).toEqual(["Hero banner"]);
    expect(await names({ kind: "pdf" })).toEqual(["User guide"]);
    expect(await names({ kind: "all" })).toEqual(["Hero banner", "Spot", "User guide"]);
    expect(await names({ type: "IMAGE" })).toEqual(["Hero banner"]); // an explicit type still wins
    const counts = await libraryCounts(world.users.admin, parseLibraryParams({}));
    expect(counts.kinds).toEqual({ video: 1, banner: 1, pdf: 1, all: 3 });
  });
});
