import { ClipboardCheck, Clock, Eye, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppBadge } from "@/components/common/app-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { MediaThumbnail } from "@/components/creatives/media-thumbnail";
import { StatusBadge } from "@/components/creatives/status-badge";
import { WorkflowActions } from "@/components/creatives/workflow-actions";
import { Button } from "@/components/ui/button";
import type { CreativeStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/current-user";
import { CATEGORY_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import { can, canReviewCreative, canWithdrawCreative } from "@/lib/permissions";
import { trySignedGetUrl } from "@/lib/storage/s3";
import { cn } from "@/lib/utils";
import { creativeVisibilityWhere } from "@/lib/visibility";
import { availableActions } from "@/lib/workflow";

export const metadata: Metadata = { title: "Pending Validation" };

export default async function ValidationPage({ searchParams }: PageProps<"/validation">) {
  const user = await requireUser();
  if (user.role === "VIEWER") redirect("/approved");
  const sp = await searchParams;
  const tab: CreativeStatus = sp.tab === "IN_REVIEW" ? "IN_REVIEW" : "PENDING";
  const app = typeof sp.app === "string" ? sp.app : undefined;
  const reviewer = can(user.role, "creative.review");

  const scope = { AND: [creativeVisibilityWhere(user), reviewer ? {} : { createdById: user.id }, app ? { applicationId: app } : {}] };
  const [pendingCount, reviewCount, oldest, rows, applications] = await Promise.all([
    prisma.creative.count({ where: { AND: [scope, { status: "PENDING" }] } }),
    prisma.creative.count({ where: { AND: [scope, { status: "IN_REVIEW" }] } }),
    prisma.creative.findFirst({ where: { AND: [scope, { status: { in: ["PENDING", "IN_REVIEW"] } }] }, orderBy: { submittedAt: "asc" }, select: { submittedAt: true } }),
    prisma.creative.findMany({
      where: { AND: [scope, { status: tab }] },
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      take: 100,
      include: {
        application: { select: { id: true, name: true, brandColor: true } },
        campaign: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        files: { where: { isCurrent: true }, orderBy: { versionType: "asc" }, select: { versionType: true, thumbnailKey: true, sizeBytes: true, mediaType: true, processingStatus: true, integrityStatus: true } },
        validations: { where: { action: { in: ["SUBMITTED", "REVIEW_STARTED"] } }, orderBy: { createdAt: "desc" }, take: 2, include: { reviewer: { select: { name: true } } } },
      },
    }),
    prisma.application.findMany({
      where: user.restrictApplications ? { id: { in: user.applicationIds } } : {},
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, brandColor: true },
    }),
  ]);

  const items = await Promise.all(
    rows.map(async (c) => {
      const full = c.files.find((f) => f.versionType === "FULL") ?? c.files[0];
      const submission = c.validations.find((v) => v.action === "SUBMITTED");
      const reviewStart = c.validations.find((v) => v.action === "REVIEW_STARTED");
      const actions = availableActions(c.status).filter((a) =>
        ["startReview", "approve", "decline", "requestChanges"].includes(a) ? canReviewCreative(user, c) : a === "withdraw" ? canWithdrawCreative(user, c) : false,
      );
      return {
        ...c,
        full,
        submission,
        reviewStart,
        actions,
        thumbnailUrl: await trySignedGetUrl(full?.thumbnailKey, { stable: true }),
      };
    }),
  );

  const tabHref = (t: CreativeStatus) => `/validation?tab=${t}${app ? `&app=${app}` : ""}`;

  return (
    <>
      <PageHeader
        title="Pending Validation"
        description={
          reviewer
            ? "Creatives waiting for a decision, oldest submission first. Approving makes the current full version the approved one."
            : "Your creatives currently waiting for validation."
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={pendingCount} icon={Inbox} tone="amber" href={tabHref("PENDING")} />
        <StatCard label="In review" value={reviewCount} icon={Eye} tone="sky" href={tabHref("IN_REVIEW")} />
        <StatCard label="Oldest waiting" value={oldest?.submittedAt ? timeAgo(oldest.submittedAt).replace(" ago", "") : "—"} icon={Clock} tone="zinc" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {(["PENDING", "IN_REVIEW"] as CreativeStatus[]).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === t ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "PENDING" ? `Pending (${pendingCount})` : `In review (${reviewCount})`}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link href={`/validation?tab=${tab}`} className={cn("rounded-full border px-3 py-1 text-xs", !app ? "bg-secondary font-medium" : "bg-card hover:bg-muted")}>
            All applications
          </Link>
          {applications.map((a) => (
            <Link
              key={a.id}
              href={`/validation?tab=${tab}&app=${a.id}`}
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs", app === a.id ? "bg-secondary font-medium" : "bg-card hover:bg-muted")}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: a.brandColor }} />
              {a.name}
            </Link>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={tab === "PENDING" ? "Nothing waiting for validation" : "Nothing in review"}
          description={reviewer ? "New submissions appear here and reviewers are notified." : "Submit a draft from its details page to request validation."}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs lg:flex-row lg:items-center" data-testid="queue-item">
              <Link href={`/creatives/${c.id}`} className="shrink-0">
                <MediaThumbnail
                  url={c.thumbnailUrl}
                  mediaType={c.full?.mediaType ?? c.mediaType}
                  processingStatus={c.full?.processingStatus}
                  className="aspect-video w-full rounded-lg border lg:w-44"
                />
              </Link>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/creatives/${c.id}`} className="truncate font-medium hover:text-primary">
                    {c.name}
                  </Link>
                  <StatusBadge status={c.status} />
                  {c.full?.integrityStatus === "MISMATCH" && <span className="text-xs font-medium text-destructive">Integrity check failed</span>}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <AppBadge name={c.application.name} color={c.application.brandColor} />
                  {c.campaign && <span>· {c.campaign.name}</span>}
                  <span>· {CATEGORY_LABELS[c.category]}</span>
                  {c.full && <span>· {formatBytes(c.full.sizeBytes)}</span>}
                  <span>· {c.files.map((f) => f.versionType.toLowerCase()).join(" + ")}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitted by {c.submission?.reviewer?.name ?? c.createdBy?.name ?? "Unknown"}{" "}
                  <time title={formatDateTime(c.submittedAt)}>{timeAgo(c.submittedAt)}</time>
                  {c.status === "IN_REVIEW" && c.reviewStart?.reviewer && <> · review started by {c.reviewStart.reviewer.name}</>}
                </p>
                {c.submission?.comment && <p className="line-clamp-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">“{c.submission.comment}”</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                <WorkflowActions creativeId={c.id} actions={c.actions} size="sm" include={["startReview", "approve", "requestChanges", "decline", "withdraw"]} />
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/creatives/${c.id}`}>Open</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
