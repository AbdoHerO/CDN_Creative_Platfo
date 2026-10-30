import "server-only";
import type { SessionUser } from "@/lib/auth/session-core";
import { prisma } from "@/lib/db";
import { trySignedGetUrl } from "@/lib/storage/s3";
import { applicationScope, creativeVisibilityWhere } from "@/lib/visibility";

/** Total stored bytes (originals + derived) per application, from database records. */
export async function storageByApplication(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ applicationId: string; bytes: bigint | null }[]>`
    SELECT c."applicationId", SUM(f."sizeBytes" + COALESCE(f."thumbnailBytes", 0) + COALESCE(f."displayBytes", 0))::bigint AS bytes
      FROM "CreativeFile" f JOIN "Creative" c ON c."id" = f."creativeId"
     GROUP BY c."applicationId"`;
  return new Map(rows.map((r) => [r.applicationId, Number(r.bytes ?? 0)]));
}

export async function listApplications(user: SessionUser) {
  const visible = creativeVisibilityWhere(user);
  const [apps, creativeCounts, campaignCounts, storage] = await Promise.all([
    prisma.application.findMany({ where: applicationScope(user), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.creative.groupBy({ by: ["applicationId"], where: { AND: [visible, { files: { some: {} } }] }, _count: { _all: true } }),
    prisma.campaign.groupBy({ by: ["applicationId"], _count: { _all: true } }),
    storageByApplication(),
  ]);
  const cc = new Map(creativeCounts.map((r) => [r.applicationId, r._count._all]));
  const pc = new Map(campaignCounts.map((r) => [r.applicationId, r._count._all]));
  return Promise.all(
    apps.map(async (a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      description: a.description,
      brandColor: a.brandColor,
      status: a.status,
      logoUrl: await trySignedGetUrl(a.logoKey, { stable: true }),
      creatives: cc.get(a.id) ?? 0,
      campaigns: pc.get(a.id) ?? 0,
      storageBytes: storage.get(a.id) ?? 0,
    })),
  );
}
