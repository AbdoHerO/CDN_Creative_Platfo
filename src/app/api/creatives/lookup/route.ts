import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { canEditCreative } from "@/lib/permissions";
import { creativeVisibilityWhere } from "@/lib/visibility";
import { apiError, apiUser, json } from "@/server/api-utils";

/** Creatives of an application the user may add versions to (association picker). */
export async function GET(request: NextRequest) {
  try {
    const user = await apiUser(request, { permission: "creative.upload", rateLimit: { key: "lookup", limit: 120, windowSeconds: 60 } });
    const applicationId = request.nextUrl.searchParams.get("applicationId") ?? "";
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    const exclude = request.nextUrl.searchParams.get("exclude") ?? undefined;
    if (!applicationId) return json({ creatives: [] });
    const rows = await prisma.creative.findMany({
      where: {
        AND: [
          creativeVisibilityWhere(user),
          { applicationId, status: { not: "ARCHIVED" } },
          exclude ? { id: { not: exclude } } : {},
          q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { files: { some: { originalFilename: { contains: q, mode: "insensitive" } } } },
                ],
              }
            : {},
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: { id: true, name: true, status: true, applicationId: true, createdById: true, submittedAt: true, files: { select: { versionType: true } } },
    });
    return json({
      creatives: rows
        .filter((c) => canEditCreative(user, c))
        .map((c) => ({ id: c.id, name: c.name, status: c.status, hasFull: c.files.some((f) => f.versionType === "FULL"), fileCount: c.files.length })),
    });
  } catch (err) {
    return apiError(err);
  }
}
