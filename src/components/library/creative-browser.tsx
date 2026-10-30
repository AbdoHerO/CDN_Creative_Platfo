import { Library, SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { UrlPagination } from "@/components/common/url-pagination";
import { Button } from "@/components/ui/button";
import type { CreativeStatus } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session-core";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { libraryFacets, parseLibraryParams, queryLibrary } from "@/server/queries/library";
import { CreativeGrid, CreativeList } from "./creative-items";
import { LibraryFilters } from "./library-filters";

type Fixed = { status?: CreativeStatus; app?: string; campaign?: string };

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
}: {
  user: SessionUser;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  fixed?: Fixed;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const params = parseLibraryParams(searchParams);
  if (fixed.app) params.app = fixed.app;
  if (fixed.campaign) params.campaign = fixed.campaign;
  const settings = await getSettings();
  const [result, facets] = await Promise.all([
    queryLibrary(user, params, { fixedStatus: fixed.status, pageSize: settings.defaultPageSize }),
    libraryFacets(user, params.app),
  ]);
  const view = params.view ?? (user.libraryView === "LIST" ? "list" : "grid");
  const hasFilters = Boolean(
    params.q || params.category || params.type || params.format || params.tag || params.uploader || params.from || params.to ||
      (!fixed.status && params.status) || (!fixed.app && params.app) || (!fixed.campaign && params.campaign),
  );

  const linkParams: Record<string, string | undefined> = {
    q: params.q,
    app: fixed.app ? undefined : params.app,
    campaign: fixed.campaign ? undefined : params.campaign,
    category: params.category,
    status: fixed.status ? undefined : params.status,
    type: params.type,
    format: params.format,
    tag: params.tag,
    uploader: params.uploader,
    from: params.from,
    to: params.to,
    sort: params.sort !== "newest" ? params.sort : undefined,
    size: params.size ? String(params.size) : undefined,
    view: params.view,
  };

  return (
    <div className="space-y-5">
      <LibraryFilters
        basePath={basePath}
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
          uploader: params.uploader ?? "",
          from: params.from ?? "",
          to: params.to ?? "",
          sort: params.sort,
        }}
        view={view}
        showPreviews={result.showPreviews}
        total={result.total}
      />

      {result.items.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={SearchX} title="No creatives match these filters" description="Try removing a filter or searching for a different term.">
            <Button asChild variant="outline" size="sm">
              <Link href={basePath}>Clear filters</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={Library} title={emptyTitle} description={emptyDescription}>
            {can(user.role, "creative.upload") && (
              <Button asChild size="sm">
                <Link href="/upload">Upload creatives</Link>
              </Button>
            )}
          </EmptyState>
        )
      ) : view === "list" ? (
        <CreativeList items={result.items} />
      ) : (
        <CreativeGrid items={result.items} />
      )}

      <UrlPagination basePath={basePath} params={linkParams} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}
