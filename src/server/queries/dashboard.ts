import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CreativeStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session-core";
import { STATUS_ORDER } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { trySignedGetUrl } from "@/lib/storage/r2";
import { creativeVisibilityWhere } from "@/lib/visibility";

/** Every dashboard figure comes from live, permission-scoped database queries. */
export async function getDashboardData(user: SessionUser) {
  // Creatives still waiting for their first upload to finish are not counted.
  const base: Prisma.CreativeWhereInput = { AND: [creativeVisibilityWhere(user), { files: { some: {} } }] };
  const fileScope: Prisma.CreativeFileWhereInput = { creative: base };
  const since = new Date(Date.now() - 29 * 86_400_000);
  since.setHours(0, 0, 0, 0);

  const [
    total,
    videos,
    images,
    banners,
    byStatus,
    byApp,
    applications,
    recentCreated,
    storage,
    storageByType,
    derived,
    fileCount,
    recentUploads,
    recentApproved,
    pendingOldest,
    activity,
  ] = await Promise.all([
    prisma.creative.count({ where: base }),
    prisma.creative.count({ where: { AND: [base, { mediaType: "VIDEO" }] } }),
    prisma.creative.count({ where: { AND: [base, { mediaType: "IMAGE" }] } }),
    prisma.creative.count({ where: { AND: [base, { category: "BANNER" }] } }),
    prisma.creative.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.creative.groupBy({ by: ["applicationId"], where: base, _count: { _all: true } }),
    prisma.application.findMany({
      where: user.restrictApplications ? { id: { in: user.applicationIds } } : {},
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, brandColor: true, status: true },
    }),
    prisma.creative.findMany({ where: { AND: [base, { createdAt: { gte: since } }] }, select: { createdAt: true } }),
    prisma.creativeFile.aggregate({ where: fileScope, _sum: { sizeBytes: true } }),
    prisma.creativeFile.groupBy({ by: ["versionType"], where: fileScope, _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.creativeFile.aggregate({ where: fileScope, _sum: { thumbnailBytes: true, displayBytes: true } }),
    prisma.creativeFile.count({ where: fileScope }),
    prisma.creative.findMany({
      where: base,
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        status: true,
        mediaType: true,
        createdAt: true,
        application: { select: { name: true, brandColor: true } },
        createdBy: { select: { name: true } },
        files: { where: { isCurrent: true }, orderBy: { versionType: "asc" }, take: 1, select: { thumbnailKey: true, processingStatus: true } },
      },
    }),
    prisma.creative.findMany({
      where: { AND: [base, { status: "APPROVED" }] },
      orderBy: { approvedAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        approvedAt: true,
        mediaType: true,
        application: { select: { name: true, brandColor: true } },
        files: { where: { isCurrent: true }, orderBy: { versionType: "asc" }, take: 1, select: { thumbnailKey: true } },
      },
    }),
    prisma.creative.findMany({
      where: { AND: [base, { status: { in: ["PENDING", "IN_REVIEW"] } }, can(user.role, "creative.review") ? {} : { createdById: user.id }] },
      orderBy: { submittedAt: "asc" },
      take: 5,
      select: { id: true, name: true, status: true, submittedAt: true, application: { select: { name: true, brandColor: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.activityLog.findMany({
      where: can(user.role, "activity.view")
        ? { action: { notIn: ["AUTH_LOGIN", "AUTH_LOGOUT", "AUTH_LOGIN_FAILED"] } }
        : { OR: [{ actorId: user.id }, { creative: creativeVisibilityWhere(user) }], action: { notIn: ["AUTH_LOGIN", "AUTH_LOGOUT", "AUTH_LOGIN_FAILED", "FILE_DOWNLOADED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, summary: true, createdAt: true, creativeId: true, actor: { select: { name: true } } },
    }),
  ]);

  const statusCounts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<CreativeStatus, number>;
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  const appCounts = new Map(byApp.map((r) => [r.applicationId, r._count._all]));
  const perApplication = applications
    .map((a) => ({ ...a, count: appCounts.get(a.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // 30 daily buckets in server-local dates.
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days: { date: string; count: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    days.push({ date: dayKey(d), count: 0 });
  }
  const index = new Map(days.map((d, i) => [d.date, i]));
  for (const c of recentCreated) {
    const i = index.get(dayKey(c.createdAt));
    if (i !== undefined) days[i].count++;
  }

  const bytesByType = Object.fromEntries(storageByType.map((r) => [r.versionType, Number(r._sum.sizeBytes ?? 0)])) as Record<string, number>;

  return {
    totals: { total, videos, images, banners, ...statusCounts },
    perApplication,
    uploadsPerDay: days,
    storage: {
      originalBytes: Number(storage._sum.sizeBytes ?? 0),
      fullBytes: bytesByType.FULL ?? 0,
      previewBytes: bytesByType.PREVIEW ?? 0,
      variantBytes: bytesByType.VARIANT ?? 0,
      derivedBytes: Number(derived._sum.thumbnailBytes ?? 0) + Number(derived._sum.displayBytes ?? 0),
      fileCount,
    },
    recentUploads: await Promise.all(
      recentUploads.map(async (c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        thumbnailUrl: await trySignedGetUrl(c.files[0]?.thumbnailKey, { stable: true }),
        processingStatus: c.files[0]?.processingStatus,
      })),
    ),
    recentApproved: await Promise.all(
      recentApproved.map(async (c) => ({
        ...c,
        approvedAt: c.approvedAt?.toISOString() ?? null,
        thumbnailUrl: await trySignedGetUrl(c.files[0]?.thumbnailKey, { stable: true }),
      })),
    ),
    pendingOldest: pendingOldest.map((c) => ({ ...c, submittedAt: c.submittedAt?.toISOString() ?? null })),
    activity: activity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}
