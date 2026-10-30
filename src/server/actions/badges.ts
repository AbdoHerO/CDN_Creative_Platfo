"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { parseInput, runAction } from "@/server/action-utils";
import { badgeSlug } from "@/lib/badges";
import { BADGE_SELECT, setCreativeBadges } from "@/server/services/badges";

const id = z.string().min(1).max(64);

const badgeSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #8B5CF6."),
});

function revalidateBadges(creativeId?: string) {
  if (creativeId) revalidatePath(`/creatives/${creativeId}`);
  for (const path of ["/library", "/approved", "/declined", "/archived", "/validation", "/settings"]) revalidatePath(path);
}

/** Switch the badges of one creative on or off. */
export async function setCreativeBadgesAction(creativeId: string, badgeIds: string[]) {
  return runAction(async () => {
    const user = await requireActionUser();
    const ids = parseInput(z.array(id).max(30), badgeIds);
    await setCreativeBadges(user, parseInput(id, creativeId), ids, await getRequestMeta());
    revalidateBadges(creativeId);
    return true;
  }, "Badges updated.");
}

async function assertFreeName(name: string, excludeId?: string) {
  const clash = await prisma.badge.findFirst({
    where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug: badgeSlug(name) }], NOT: excludeId ? { id: excludeId } : undefined },
    select: { id: true },
  });
  if (clash) throw new AppError("A badge with this name already exists.", 409, { name: "Name already in use." });
}

export async function createBadgeAction(input: z.input<typeof badgeSchema>) {
  return runAction(async () => {
    const user = await requireActionUser("badge.manage");
    const data = parseInput(badgeSchema, input);
    await assertFreeName(data.name);
    const maxOrder = await prisma.badge.aggregate({ _max: { sortOrder: true } });
    const badge = await prisma.badge.create({
      data: { name: data.name, slug: badgeSlug(data.name), color: data.color.toUpperCase(), sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
      select: BADGE_SELECT,
    });
    await logActivity({
      actorId: user.id,
      action: "SETTINGS_UPDATED",
      entityType: "SETTINGS",
      summary: `${user.name} created the badge “${badge.name}”`,
      meta: await getRequestMeta(),
    });
    revalidateBadges();
    return badge;
  }, "Badge created.");
}

export async function updateBadgeAction(badgeId: string, input: z.input<typeof badgeSchema>) {
  return runAction(async () => {
    const user = await requireActionUser("badge.manage");
    const data = parseInput(badgeSchema, input);
    const before = await prisma.badge.findUnique({ where: { id: parseInput(id, badgeId) } });
    if (!before) throw new NotFoundError("Badge not found.");
    await assertFreeName(data.name, before.id);
    const badge = await prisma.badge.update({
      where: { id: before.id },
      data: { name: data.name, slug: badgeSlug(data.name), color: data.color.toUpperCase() },
      select: BADGE_SELECT,
    });
    await logActivity({
      actorId: user.id,
      action: "SETTINGS_UPDATED",
      entityType: "SETTINGS",
      summary: `${user.name} updated the badge “${before.name}”${before.name !== badge.name ? ` (now “${badge.name}”)` : ""}`,
      meta: await getRequestMeta(),
    });
    revalidateBadges();
    return badge;
  }, "Badge updated.");
}

export async function deleteBadgeAction(badgeId: string) {
  return runAction(async () => {
    const user = await requireActionUser("badge.manage");
    const badge = await prisma.badge.findUnique({ where: { id: parseInput(id, badgeId) }, include: { _count: { select: { creatives: true } } } });
    if (!badge) throw new NotFoundError("Badge not found.");
    await prisma.badge.delete({ where: { id: badge.id } });
    await logActivity({
      actorId: user.id,
      action: "SETTINGS_UPDATED",
      entityType: "SETTINGS",
      summary: `${user.name} deleted the badge “${badge.name}” (removed from ${badge._count.creatives} creative${badge._count.creatives === 1 ? "" : "s"})`,
      meta: await getRequestMeta(),
    });
    revalidateBadges();
    return true;
  }, "Badge deleted.");
}
