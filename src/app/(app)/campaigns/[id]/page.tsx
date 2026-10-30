import { CalendarRange, CheckCircle2, Clock, Layers, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";
import { DeleteCampaignButton } from "@/components/campaigns/delete-campaign-button";
import { AppBadge } from "@/components/common/app-badge";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { CreativeBrowser } from "@/components/library/creative-browser";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { can, hasApplicationAccess } from "@/lib/permissions";
import { applicationScope, creativeVisibilityWhere } from "@/lib/visibility";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";

export async function generateMetadata({ params }: PageProps<"/campaigns/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Campaign" };
}

export default async function CampaignPage({ params, searchParams }: PageProps<"/campaigns/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      application: { select: { id: true, name: true, brandColor: true, status: true } },
      tags: { include: { tag: { select: { name: true, slug: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!campaign || !hasApplicationAccess(user, campaign.applicationId)) notFound();

  const base = { AND: [creativeVisibilityWhere(user), { campaignId: id }, { files: { some: {} } }] };
  const manage = can(user.role, "campaign.manage");
  const [total, approved, pending, applications, tags] = await Promise.all([
    prisma.creative.count({ where: base }),
    prisma.creative.count({ where: { AND: [base, { status: "APPROVED" }] } }),
    prisma.creative.count({ where: { AND: [base, { status: { in: ["PENDING", "IN_REVIEW"] } }] } }),
    manage
      ? prisma.application.findMany({ where: applicationScope(user), orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, brandColor: true } })
      : [],
    manage ? prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, take: 500 }) : [],
  ]);
  const toDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Campaigns", href: "/campaigns" }, { label: campaign.application.name, href: `/applications/${campaign.application.id}` }, { label: campaign.name }]}
        title={
          <span className="flex items-center gap-3">
            {campaign.name}
            <CampaignStatusBadge status={campaign.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <AppBadge name={campaign.application.name} color={campaign.application.brandColor} size="md" />
            <span className="text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-1">
              <CalendarRange className="size-3.5" />
              {campaign.startDate ? formatDate(campaign.startDate) : "No start date"} – {campaign.endDate ? formatDate(campaign.endDate) : "open-ended"}
            </span>
            {campaign.createdBy && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span>Created by {campaign.createdBy.name}</span>
              </>
            )}
          </span>
        }
        actions={
          <>
            {can(user.role, "creative.upload") && campaign.application.status === "ACTIVE" && (
              <Button asChild>
                <Link href={`/upload?app=${campaign.applicationId}&campaign=${campaign.id}`}>
                  <Upload /> Upload to campaign
                </Link>
              </Button>
            )}
            {manage && (
              <CampaignFormDialog
                campaign={{
                  id: campaign.id,
                  name: campaign.name,
                  applicationId: campaign.applicationId,
                  description: campaign.description,
                  startDate: toDate(campaign.startDate),
                  endDate: toDate(campaign.endDate),
                  status: campaign.status,
                  tags: campaign.tags.map((t) => t.tag.name),
                }}
                applications={applications}
                tagSuggestions={tags.map((t) => t.name)}
              />
            )}
            {manage && <DeleteCampaignButton id={campaign.id} name={campaign.name} creatives={total} />}
          </>
        }
      >
        {(campaign.description || campaign.tags.length > 0) && (
          <div className="space-y-2">
            {campaign.description && <p className="max-w-3xl text-sm">{campaign.description}</p>}
            {campaign.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {campaign.tags.map((t) => (
                  <Link key={t.tag.slug} href={`/library?tag=${t.tag.slug}`} className="rounded-md bg-secondary px-2 py-0.5 text-xs hover:bg-accent">
                    {t.tag.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </PageHeader>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Creatives" value={total} icon={Layers} />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} tone="emerald" />
        <StatCard label="Awaiting validation" value={pending} icon={Clock} tone="amber" />
      </div>

      <CreativeBrowser
        user={user}
        basePath={`/campaigns/${campaign.id}`}
        searchParams={await searchParams}
        fixed={{ app: campaign.applicationId, campaign: campaign.id }}
        emptyTitle="No creatives in this campaign yet"
        emptyDescription="Upload creatives directly into this campaign, or assign existing ones from their details page."
      />
    </>
  );
}
