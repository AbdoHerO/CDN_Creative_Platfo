import { FolderKanban } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CampaignFormDialog } from "@/components/campaigns/campaign-form-dialog";
import { AppBadge } from "@/components/common/app-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import type { CampaignStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/current-user";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { CampaignStatusBadge } from "@/components/campaigns/campaign-status-badge";
import { applicationScope, campaignScope, creativeVisibilityWhere } from "@/lib/visibility";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const user = await requireUser();
  const sp = await searchParams;
  const app = typeof sp.app === "string" ? sp.app : undefined;
  const status = typeof sp.status === "string" && sp.status in CAMPAIGN_STATUS_LABELS ? (sp.status as CampaignStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const visible = creativeVisibilityWhere(user);
  const [campaigns, applications, tags] = await Promise.all([
    prisma.campaign.findMany({
      where: {
        AND: [
          campaignScope(user),
          app ? { applicationId: app } : {},
          status ? { status } : {},
          q ? { name: { contains: q, mode: "insensitive" } } : {},
        ],
      },
      orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      include: {
        application: { select: { id: true, name: true, brandColor: true } },
        tags: { include: { tag: { select: { name: true } } } },
        _count: { select: { creatives: { where: { AND: [visible, { files: { some: {} } }] } } } },
      },
    }),
    prisma.application.findMany({ where: applicationScope(user), orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, brandColor: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, take: 500 }),
  ]);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { app, status, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/campaigns?${s}` : "/campaigns";
  };

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Open a campaign to see all of its creatives in one place."
        actions={can(user.role, "campaign.manage") && <CampaignFormDialog applications={applications} tagSuggestions={tags.map((t) => t.name)} defaultApplicationId={app} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/campaigns" className="flex-1 sm:max-w-xs">
          {app && <input type="hidden" name="app" value={app} />}
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search campaigns…"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Link href={href({ app: undefined })} className={cn("rounded-full border px-3 py-1 text-xs", !app ? "bg-secondary font-medium" : "bg-card hover:bg-muted")}>
            All applications
          </Link>
          {applications.map((a) => (
            <Link
              key={a.id}
              href={href({ app: a.id })}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs", app === a.id ? "bg-secondary font-medium" : "bg-card hover:bg-muted")}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: a.brandColor }} />
              {a.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:ml-auto">
          {(["ACTIVE", "PLANNED", "PAUSED", "COMPLETED", "ARCHIVED"] as CampaignStatus[]).map((s) => (
            <Link
              key={s}
              href={href({ status: status === s ? undefined : s })}
              className={cn("rounded-full border px-3 py-1 text-xs", status === s ? "bg-secondary font-medium" : "bg-card hover:bg-muted")}
            >
              {CAMPAIGN_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No campaigns found" description={q || app || status ? "Try different filters." : "Create a campaign to group creatives."} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-3 py-2.5 font-medium">Application</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Dates</th>
                  <th className="px-3 py-2.5 font-medium">Creatives</th>
                  <th className="px-4 py-2.5 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link href={`/campaigns/${c.id}`} className="font-medium hover:text-primary">
                        {c.name}
                      </Link>
                      {c.description && <p className="line-clamp-1 max-w-sm text-xs text-muted-foreground">{c.description}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <AppBadge name={c.application.name} color={c.application.brandColor} />
                    </td>
                    <td className="px-3 py-3">
                      <CampaignStatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {c.startDate ? formatDate(c.startDate) : "—"} → {c.endDate ? formatDate(c.endDate) : "—"}
                    </td>
                    <td className="tabular px-3 py-3">{formatNumber(c._count.creatives)}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span key={t.tag.name} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                            {t.tag.name}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
