import { Library, SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { UrlPagination } from "@/components/common/url-pagination";
import { Button } from "@/components/ui/button";
import type { CreativeStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session-core";
import { can, canReviewCreative, canSubmitCreative, canWithdrawCreative, type CreativeRef } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { availableActions, type BulkAction, type WorkflowAction } from "@/lib/workflow";
import { activeKind, libraryCounts, libraryFacets, parseLibraryParams, queryLibrary, type LibraryItem } from "@/server/queries/library";
import { listBadges } from "@/server/services/badges";
import { CreativeList } from "./creative-items";
import { BulkTabBar, LibraryEditProvider } from "./edit-mode";
import { LibraryFilters } from "./library-filters";
import { LibraryHero } from "./library-hero";
import { ReelGrid } from "./reel-grid";

type Fixed = { status?: CreativeStatus; app?: string; campaign?: string; uploader?: string };

const QUEUE_ACTIONS: WorkflowAction[] = ["submit", "startReview", "approve", "requestChanges", "decline", "withdraw"];

/** Validation actions offered on a selection: submit for creators and reviewers, approve for reviewers. */
function bulkActionsFor(user: SessionUser, status?: CreativeStatus): BulkAction[] {
  if (status === "APPROVED" || status === "ARCHIVED") return [];
  const reviewer = can(user.role, "creative.review");
  const pendingOnly = status === "PENDING" || status === "IN_REVIEW";
  return [
    ...(!pendingOnly && (reviewer || can(user.role, "creative.upload")) ? (["submit"] as const) : []),
    ...(reviewer ? (["approve"] as const) : []),
  ];
}

/** Workflow buttons the user may use on a library row (same rules as the creative page). */
function rowActions(user: SessionUser, item: LibraryItem): WorkflowAction[] {
  const ref: CreativeRef = { applicationId: item.application.id, createdById: item.uploadedBy?.id ?? null, status: item.status };
  return availableActions(item.status).filter((a) => {
    if (!QUEUE_ACTIONS.includes(a)) return false;
    if (a === "submit") return canSubmitCreative(user, ref);
    if (a === "withdraw") return canWithdrawCreative(user, ref);
    return canReviewCreative(user, ref);
  });
}

/**
 * Searchable, filterable creative listing. All state lives in the URL so views
 * are shareable and the back button works; data is queried on the server.
 */
export async function CreativeBrowser({
  user,
  basePath,
  searchParams,
  fixed = {},
  emptyTitle = "No creatives yet",
  emptyDescription = "Uploaded creatives will appear here.",
  workflow = false,
  extraParams = {},
  bulkTab,
}: {
  user: SessionUser;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  fixed?: Fixed;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Show validation buttons (submit, approve, decline…) under each creative. */
  workflow?: boolean;
  /** Parameters of the hosting page kept in pagination links (e.g. the queue tab). */
  extraParams?: Record<string, string>;
  /** Validation tab: number of creatives the "Submit all" / "Approve all" bar acts on. */
  bulkTab?: { status: "DRAFT" | "DECLINED" | "PENDING" | "IN_REVIEW"; count: number };
}) {
  const params = parseLibraryParams(searchParams);
  if (fixed.app) params.app = fixed.app;
  if (fixed.campaign) params.campaign = fixed.campaign;
  if (fixed.uploader) params.uploader = fixed.uploader;
  const settings = await getSettings();
  const canEditBadges = can(user.role, "badge.manage");
  const [result, facets, counts, badgeCatalog] = await Promise.all([
    queryLibrary(user, params, { fixedStatus: fixed.status, pageSize: settings.defaultPageSize }),
    libraryFacets(user, params.app),
    libraryCounts(user, params, fixed.status),
    canEditBadges ? listBadges() : Promise.resolve([]),
  ]);
  const actions = workflow ? Object.fromEntries(result.items.map((i) => [i.creativeId, rowActions(user, i)])) : undefined;
  const extra = new URLSearchParams(extraParams).toString();
  const resetHref = extra ? `${basePath}?${extra}` : basePath;
  const showPlatforms = !fixed.app && facets.applications.length > 1;
  // Viewers only ever see approved creatives, and status pages are fixed to one status.
  const showReview = !fixed.status && user.role !== "VIEWER";
  const kind = activeKind(params);
  const KIND_EMPTY = { video: "No videos here yet", banner: "No banners here yet", pdf: "No PDFs here yet", all: emptyTitle } as const;
  const view = params.view ?? (user.libraryView === "LIST" ? "list" : "grid");
  const hasFilters = Boolean(
    params.q || params.category || params.type || params.format || params.tag || params.badge || params.review || params.lite || params.uploader || params.from || params.to ||
      (!fixed.status && params.status) || (!fixed.app && params.app) || (!fixed.campaign && params.campaign),
  );

  const linkParams: Record<string, string | undefined> = {
    q: params.q,
    app: fixed.app ? undefined : params.app,
    campaign: fixed.campaign ? undefined : params.campaign,
    category: params.category,
    status: fixed.status ? undefined : params.status,
    type: params.type,
    kind: params.kind !== "video" ? params.kind : undefined,
    format: params.format,
    tag: params.tag,
    badge: params.badge,
    review: params.review,
    lite: params.lite,
    uploader: params.uploader,
    from: params.from,
    to: params.to,
    sort: params.sort !== "newest" ? params.sort : undefined,
    size: params.size ? String(params.size) : undefined,
    view: params.view,
    ...extraParams,
  };

  return (
    <LibraryEditProvider
      badges={canEditBadges}
      actions={bulkActionsFor(user, fixed.status)}
      tab={bulkTab ?? null}
      catalog={badgeCatalog}
      canCreate={canEditBadges}
      pageIds={[...new Set(result.items.map((i) => i.creativeId))]}
    >
    <div className="space-y-5">
      <LibraryHero
        applications={facets.applications}
        counts={counts}
        values={{ app: params.app ?? "", review: params.review ?? "", lite: params.lite ?? "", kind }}
        showPlatforms={showPlatforms}
        showReview={showReview}
      />
      <LibraryFilters
        hideApplication={showPlatforms}
        basePath={resetHref}
        facets={facets}
        fixed={{ status: !!fixed.status, app: !!fixed.app, campaign: !!fixed.campaign }}
        values={{
          q: params.q ?? "",
          app: params.app ?? "",
          campaign: params.campaign ?? "",
          category: params.category ?? "",
          status: params.status ?? "",
          type: params.type ?? "",
          format: params.format ?? "",
          tag: params.tag ?? "",
          badge: params.badge ?? "",
          review: params.review ?? "",
          lite: params.lite ?? "",
          uploader: params.uploader ?? "",
          from: params.from ?? "",
          to: params.to ?? "",
          sort: params.sort,
        }}
        view={view}
        showPreviews={result.showPreviews}
        total={result.total}
      />

      {bulkTab && <BulkTabBar />}

      {result.items.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={SearchX} title="No creatives match these filters" description="Try removing a filter or searching for a different term.">
            <Button asChild variant="outline" size="sm">
              <Link href={resetHref}>Clear filters</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Library}
            title={KIND_EMPTY[kind]}
            description={kind === "all" ? emptyDescription : "Switch to another tab above, or upload new creatives."}
          >
            {can(user.role, "creative.upload") && (
              <Button asChild size="sm">
                <Link href="/upload">Upload creatives</Link>
              </Button>
            )}
          </EmptyState>
        )
      ) : view === "list" ? (
        <CreativeList items={result.items} actions={actions} />
      ) : (
        <ReelGrid items={result.items} shape={kind === "banner" || kind === "pdf" ? "landscape" : "portrait"} actions={actions} />
      )}

      <UrlPagination basePath={basePath} params={linkParams} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
    </LibraryEditProvider>
  );
}
