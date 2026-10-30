import type { Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/lib/permissions";

/**
 * Prisma `where` fragments that scope every creative / application / campaign
 * query to what the current user may see. Used by lists, search, dashboard
 * statistics and storage analytics alike, so numbers never leak hidden data.
 */

export function applicationScope(actor: Actor): Prisma.ApplicationWhereInput {
  return actor.restrictApplications ? { id: { in: actor.applicationIds } } : {};
}

export function creativeVisibilityWhere(actor: Actor): Prisma.CreativeWhereInput {
  const and: Prisma.CreativeWhereInput[] = [];
  if (actor.restrictApplications) and.push({ applicationId: { in: actor.applicationIds } });
  if (actor.role === "VIEWER") and.push({ status: "APPROVED" });
  if (actor.role === "CREATOR") and.push({ OR: [{ status: { not: "DRAFT" } }, { createdById: actor.id }] });
  return and.length ? { AND: and } : {};
}

export function campaignScope(actor: Actor): Prisma.CampaignWhereInput {
  return actor.restrictApplications ? { applicationId: { in: actor.applicationIds } } : {};
}
