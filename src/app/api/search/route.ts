import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { trySignedGetUrl } from "@/lib/storage/s3";
import { campaignScope, applicationScope, creativeVisibilityWhere } from "@/lib/visibility";
import { searchWhere } from "@/server/queries/library";

/** Quick search for the ⌘K palette. Full results live on /library?q=… */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const limited = await rateLimit(`search:${user.id}`, 120, 60);
  if (!limited.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ creatives: [], campaigns: [], applications: [] });

  const [creatives, campaigns, applications] = await Promise.all([
    prisma.creative.findMany({
      where: { AND: [creativeVisibilityWhere(user), { files: { some: {} } }, ...searchWhere(q)] },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        status: true,
        mediaType: true,
        application: { select: { name: true } },
        files: {
          where: { isCurrent: true },
          orderBy: { versionType: "asc" },
          take: 1,
          select: { thumbnailKey: true },
        },
      },
    }),
    prisma.campaign.findMany({
      where: { AND: [campaignScope(user), { name: { contains: q, mode: "insensitive" } }] },
      take: 4,
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, application: { select: { name: true } } },
    }),
    prisma.application.findMany({
      where: { AND: [applicationScope(user), { name: { contains: q, mode: "insensitive" } }] },
      take: 4,
      select: { id: true, name: true, brandColor: true },
    }),
  ]);

  return NextResponse.json(
    {
      creatives: await Promise.all(
        creatives.map(async (c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          mediaType: c.mediaType,
          application: c.application.name,
          thumbnailUrl: await trySignedGetUrl(c.files[0]?.thumbnailKey, { stable: true }),
        })),
      ),
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, application: c.application.name })),
      applications,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
