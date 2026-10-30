import { logActivity } from "@/lib/activity";
import { prisma, type Db } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { canEditCreative } from "@/lib/permissions";
import type { RequestMeta } from "@/lib/request";
import type { ActorWithName } from "./creatives";

/**
 * Badges: short coloured labels on creatives ("Motion graphique",
 * "Higgsfield", "3D", "Sans miniature"…). The catalog is managed by admins
 * and managers; anyone who may edit a creative can switch its badges on/off.
 */

export type BadgeView = { id: string; name: string; slug: string; color: string };

export const BADGE_SELECT = { id: true, name: true, slug: true, color: true } as const;

export async function listBadges(db: Db = prisma): Promise<BadgeView[]> {
  return db.badge.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: BADGE_SELECT });
}

/** Replace the badges of a creative. */
export async function setCreativeBadges(actor: ActorWithName, creativeId: string, badgeIds: string[], meta?: RequestMeta | null) {
  return prisma.$transaction(async (tx) => {
    const creative = await tx.creative.findUnique({
      where: { id: creativeId },
      select: { id: true, name: true, status: true, applicationId: true, createdById: true, submittedAt: true },
    });
    if (!creative) throw new NotFoundError("Creative not found.");
    if (!canEditCreative(actor, creative)) throw new ForbiddenError("You cannot edit this creative.");
    const ids = [...new Set(badgeIds)];
    const badges = await tx.badge.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    if (badges.length !== ids.length) throw new AppError("A selected badge no longer exists.", 422);
    await tx.creativeBadge.deleteMany({ where: { creativeId } });
    if (ids.length) await tx.creativeBadge.createMany({ data: ids.map((badgeId) => ({ creativeId, badgeId })) });
    await tx.creative.update({ where: { id: creativeId }, data: { updatedAt: new Date() } });
    await logActivity(
      {
        actorId: actor.id,
        action: "CREATIVE_UPDATED",
        entityType: "CREATIVE",
        entityId: creativeId,
        creativeId,
        applicationId: creative.applicationId,
        summary: `${actor.name} set the badges of “${creative.name}” to ${badges.length ? badges.map((b) => b.name).join(", ") : "none"}`,
        metadata: { changed: ["badges"], badges: badges.map((b) => b.name) },
        meta,
      },
      tx,
    );
  });
}
