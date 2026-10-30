import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import {
  CreativeCategory,
  CreativeStatus,
  MediaType,
  type ProcessingStatus,
  type VersionType,
} from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session-core";
import { LIBRARY_SORTS, PAGE_SIZES, type LibrarySort } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { trySignedGetUrl } from "@/lib/storage/r2";
import { creativeVisibilityWhere } from "@/lib/visibility";

/**
 * Library listing.
 *
 * Rows are *files*, not creatives: one row per creative's current FULL version,
 * plus one row per current PREVIEW version when the user enabled
 * "Show preview versions". This keeps previews out of the library by default
 * while still letting them be listed (and labelled) on demand — and keeps
 * filtering, sorting by file size and pagination in a single indexed query.
 */

const enumOrUndefined = <T extends Record<string, string>>(e: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v && Object.values(e).includes(v) ? (v as T[keyof T]) : undefined));

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && /^[a-z0-9]{10,40}$/i.test(v) ? v : undefined));

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined));

export const libraryParamsSchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 200) || undefined),
  app: optionalId,
  campaign: optionalId,
  category: enumOrUndefined(CreativeCategory),
  status: enumOrUndefined(CreativeStatus),
  type: enumOrUndefined(MediaType),
  format: z
    .string()
    .optional()
    .transform((v) => (v && /^[a-z0-9]{1,8}$/.test(v) ? v : undefined)),
  tag: z
    .string()
    .optional()
    .transform((v) => (v && /^[a-z0-9-]{1,60}$/.test(v) ? v : undefined)),
  uploader: optionalId,
  from: optionalDate,
  to: optionalDate,
  sort: z
    .string()
    .optional()
    .transform((v): LibrarySort => (v && v in LIBRARY_SORTS ? (v as LibrarySort) : "newest")),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  size: z.coerce
    .number()
    .int()
    .optional()
    .transform((v) => (PAGE_SIZES as readonly number[]).includes(v ?? 0) ? (v as number) : undefined),
  view: z
    .string()
    .optional()
    .transform((v) => (v === "grid" || v === "list" ? v : undefined)),
});

export type LibraryParams = z.output<typeof libraryParamsSchema>;

export function parseLibraryParams(searchParams: Record<string, string | string[] | undefined>): LibraryParams {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === "string") flat[k] = value;
  }
  return libraryParamsSchema.parse(flat);
}

/** Search tokens: every token must match at least one searchable field. */
export function searchWhere(q: string | undefined): Prisma.CreativeWhereInput[] {
  if (!q) return [];
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
  return tokens.map((token) => {
    const contains = { contains: token, mode: "insensitive" as const };
    return {
      OR: [
        { name: contains },
        { description: contains },
        { keywords: { has: token.toLowerCase() } },
        { tags: { some: { tag: { name: contains } } } },
        { campaign: { name: contains } },
        { application: { name: contains } },
        { files: { some: { originalFilename: contains } } },
      ],
    };
  });
}

export function buildCreativeWhere(user: SessionUser, p: Partial<LibraryParams>, fixedStatus?: CreativeStatus): Prisma.CreativeWhereInput {
  const and: Prisma.CreativeWhereInput[] = [creativeVisibilityWhere(user)];
  const status = fixedStatus ?? p.status;
  // Archived creatives stay out of the main library unless explicitly requested.
  and.push(status ? { status } : { status: { not: "ARCHIVED" } });
  if (p.app) and.push({ applicationId: p.app });
  if (p.campaign) and.push({ campaignId: p.campaign });
  if (p.category) and.push({ category: p.category });
  if (p.tag) and.push({ tags: { some: { tag: { slug: p.tag } } } });
  if (p.uploader) and.push({ createdById: p.uploader });
  if (p.from) and.push({ createdAt: { gte: new Date(`${p.from}T00:00:00.000Z`) } });
  if (p.to) and.push({ createdAt: { lt: new Date(new Date(`${p.to}T00:00:00.000Z`).getTime() + 86_400_000) } });
  and.push(...searchWhere(p.q));
  return { AND: and };
}

function orderBy(sort: LibrarySort): Prisma.CreativeFileOrderByWithRelationInput[] {
  // Tie-breakers keep a creative's FULL row directly before its PREVIEW row.
  const tie: Prisma.CreativeFileOrderByWithRelationInput[] = [{ creativeId: "desc" }, { versionType: "asc" }];
  switch (sort) {
    case "oldest":
      return [{ creative: { createdAt: "asc" } }, ...tie];
    case "name":
      return [{ creative: { name: "asc" } }, ...tie];
    case "updated":
      return [{ creative: { updatedAt: "desc" } }, ...tie];
    case "largest":
      return [{ sizeBytes: "desc" }, ...tie];
    case "smallest":
      return [{ sizeBytes: "asc" }, ...tie];
    default:
      return [{ creative: { createdAt: "desc" } }, ...tie];
  }
}

export type LibraryItem = {
  fileId: string;
  creativeId: string;
  name: string;
  status: CreativeStatus;
  category: CreativeCategory;
  mediaType: MediaType;
  versionType: VersionType;
  versionNumber: number;
  originalFilename: string;
  extension: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  processingStatus: ProcessingStatus;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  application: { id: string; name: string; brandColor: string };
  campaign: { id: string; name: string } | null;
  uploadedBy: { id: string; name: string } | null;
  versions: { full: number; preview: number; variant: number };
};

export async function queryLibrary(
  user: SessionUser,
  params: LibraryParams,
  opts: { fixedStatus?: CreativeStatus; pageSize: number; showPreviews?: boolean },
) {
  const showPreviews = opts.showPreviews ?? user.showPreviewVersions;
  const where: Prisma.CreativeFileWhereInput = {
    isCurrent: true,
    versionType: showPreviews ? { in: ["FULL", "PREVIEW"] } : "FULL",
    creative: buildCreativeWhere(user, params, opts.fixedStatus),
    ...(params.type ? { mediaType: params.type } : {}),
    ...(params.format ? { extension: params.format } : {}),
  };
  const pageSize = params.size ?? opts.pageSize;
  const page = params.page;

  const [total, rows] = await Promise.all([
    prisma.creativeFile.count({ where }),
    prisma.creativeFile.findMany({
      where,
      orderBy: orderBy(params.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        versionType: true,
        versionNumber: true,
        originalFilename: true,
        extension: true,
        sizeBytes: true,
        mediaType: true,
        width: true,
        height: true,
        durationSeconds: true,
        processingStatus: true,
        thumbnailKey: true,
        creative: {
          select: {
            id: true,
            name: true,
            status: true,
            category: true,
            mediaType: true,
            createdAt: true,
            updatedAt: true,
            application: { select: { id: true, name: true, brandColor: true } },
            campaign: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            files: { select: { versionType: true } },
          },
        },
      },
    }),
  ]);

  const items: LibraryItem[] = await Promise.all(
    rows.map(async (r) => ({
      fileId: r.id,
      creativeId: r.creative.id,
      name: r.creative.name,
      status: r.creative.status,
      category: r.creative.category,
      mediaType: r.mediaType,
      versionType: r.versionType,
      versionNumber: r.versionNumber,
      originalFilename: r.originalFilename,
      extension: r.extension,
      sizeBytes: Number(r.sizeBytes),
      width: r.width,
      height: r.height,
      durationSeconds: r.durationSeconds,
      processingStatus: r.processingStatus,
      thumbnailUrl: await trySignedGetUrl(r.thumbnailKey, { stable: true }),
      createdAt: r.creative.createdAt.toISOString(),
      updatedAt: r.creative.updatedAt.toISOString(),
      application: r.creative.application,
      campaign: r.creative.campaign,
      uploadedBy: r.creative.createdBy,
      versions: {
        full: r.creative.files.filter((f) => f.versionType === "FULL").length,
        preview: r.creative.files.filter((f) => f.versionType === "PREVIEW").length,
        variant: r.creative.files.filter((f) => f.versionType === "VARIANT").length,
      },
    })),
  );

  return { items, total, page, pageSize, showPreviews };
}

/** Options for the filter bar, scoped to what the user can see. */
export async function libraryFacets(user: SessionUser, selectedApp?: string) {
  const visible = creativeVisibilityWhere(user);
  const [applications, campaigns, tags, uploaders] = await Promise.all([
    prisma.application.findMany({
      where: user.restrictApplications ? { id: { in: user.applicationIds } } : {},
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, brandColor: true },
    }),
    prisma.campaign.findMany({
      where: {
        ...(selectedApp ? { applicationId: selectedApp } : {}),
        ...(user.restrictApplications ? { applicationId: { in: user.applicationIds } } : {}),
      },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, application: { select: { name: true } } },
      take: 300,
    }),
    prisma.tag.findMany({
      where: { creatives: { some: { creative: visible } } },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
      take: 300,
    }),
    prisma.user.findMany({
      where: { createdCreatives: { some: visible } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 300,
    }),
  ]);
  return {
    applications,
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, application: c.application.name })),
    tags,
    uploaders,
  };
}

export type LibraryFacets = Awaited<ReturnType<typeof libraryFacets>>;
