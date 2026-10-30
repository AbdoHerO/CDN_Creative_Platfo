"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CampaignStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { slugify } from "@/lib/ids";
import { hasApplicationAccess } from "@/lib/permissions";
import { parseInput, runAction } from "@/server/action-utils";
import { ensureTags } from "@/server/services/tags";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .or(z.literal("").transform(() => null));

const schema = z
  .object({
    name: z.string().trim().min(2, "Name is required.").max(120),
    applicationId: z.string().min(1, "Choose an application."),
    description: z.string().trim().max(2000).nullish(),
    startDate: dateString,
    endDate: dateString,
    status: z.enum(CampaignStatus),
    tags: z.array(z.string().max(40)).max(30).default([]),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { path: ["endDate"], message: "End date must be after the start date." });

async function uniqueSlug(applicationId: string, name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.campaign.findUnique({ where: { applicationId_slug: { applicationId, slug } }, select: { id: true } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

function revalidateCampaigns(id?: string) {
  revalidatePath("/campaigns");
  if (id) revalidatePath(`/campaigns/${id}`);
}

export async function saveCampaignAction(id: string | null, input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await requireActionUser("campaign.manage");
    const data = parseInput(schema, input);
    if (!hasApplicationAccess(user, data.applicationId)) throw new ForbiddenError();
    const app = await prisma.application.findUnique({ where: { id: data.applicationId }, select: { id: true, name: true } });
    if (!app) throw new AppError("Application not found.", 422, { applicationId: "Choose an application." });

    const existing = id ? await prisma.campaign.findUnique({ where: { id }, include: { _count: { select: { creatives: true } } } }) : null;
    if (id && !existing) throw new NotFoundError("Campaign not found.");
    if (existing && existing.applicationId !== data.applicationId && existing._count.creatives > 0) {
      throw new AppError("A campaign with creatives cannot move to another application.", 409, { applicationId: "Campaign already has creatives." });
    }

    const tagIds = await ensureTags(prisma, data.tags);
    const values = {
      name: data.name,
      applicationId: data.applicationId,
      description: data.description || null,
      startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
      endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
      status: data.status,
    };
    const campaign = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.campaignTag.deleteMany({ where: { campaignId: existing.id } });
        return tx.campaign.update({
          where: { id: existing.id },
          data: {
            ...values,
            slug: existing.name === data.name && existing.applicationId === data.applicationId ? existing.slug : await uniqueSlug(data.applicationId, data.name, existing.id),
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
        });
      }
      return tx.campaign.create({
        data: { ...values, slug: await uniqueSlug(data.applicationId, data.name), createdById: user.id, tags: { create: tagIds.map((tagId) => ({ tagId })) } },
      });
    });
    await logActivity({
      actorId: user.id,
      action: existing ? "CAMPAIGN_UPDATED" : "CAMPAIGN_CREATED",
      entityType: "CAMPAIGN",
      entityId: campaign.id,
      applicationId: data.applicationId,
      summary: `${user.name} ${existing ? "updated" : "created"} campaign ${campaign.name} (${app.name})`,
      meta: await getRequestMeta(),
    });
    revalidateCampaigns(campaign.id);
    return { id: campaign.id };
  }, id ? "Campaign updated." : "Campaign created.");
}

export async function deleteCampaignAction(id: string) {
  return runAction(async () => {
    const user = await requireActionUser("campaign.manage");
    const campaign = await prisma.campaign.findUnique({ where: { id }, include: { _count: { select: { creatives: true } } } });
    if (!campaign) throw new NotFoundError();
    if (!hasApplicationAccess(user, campaign.applicationId)) throw new ForbiddenError();
    await prisma.campaign.delete({ where: { id } });
    await logActivity({
      actorId: user.id,
      action: "CAMPAIGN_DELETED",
      entityType: "CAMPAIGN",
      entityId: id,
      applicationId: campaign.applicationId,
      summary: `${user.name} deleted campaign ${campaign.name} (${campaign._count.creatives} creatives were detached)`,
      meta: await getRequestMeta(),
    });
    revalidateCampaigns();
    return true;
  }, "Campaign deleted. Its creatives were kept.");
}
