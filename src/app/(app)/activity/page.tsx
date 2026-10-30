import { Activity } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { UrlPagination } from "@/components/common/url-pagination";
import { UserAvatar } from "@/components/common/user-avatar";
import { ActivityAction, EntityType } from "@/generated/prisma/enums";
import { ACTIVITY_LABELS } from "@/lib/activity";
import { requirePagePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { activityWhere, parseActivityParams } from "@/server/queries/activity";

export const metadata: Metadata = { title: "Activity History" };

const PAGE_SIZE = 50;
const ENTITY_LABELS: Record<EntityType, string> = {
  USER: "Users",
  CREATIVE: "Creatives",
  FILE: "Files",
  APPLICATION: "Applications",
  CAMPAIGN: "Campaigns",
  IMPORT: "Imports",
  SETTINGS: "Settings",
  STORAGE: "Storage",
};

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  await requirePagePermission("activity.view");
  const sp = await searchParams;
  const params = parseActivityParams(sp);
  const where = activityWhere(params);
  const [total, rows, users, applications] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        actor: { select: { name: true, email: true } },
        creative: { select: { id: true, name: true } },
        application: { select: { name: true, brandColor: true } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.application.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Activity History" description="A complete, tamper-evident audit trail of uploads, edits, status changes, downloads and administration." />
      <ActivityFilters
        users={users}
        applications={applications}
        actions={(Object.keys(ActivityAction) as ActivityAction[]).map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))}
        entities={(Object.keys(EntityType) as EntityType[]).map((e) => ({ value: e, label: ENTITY_LABELS[e] }))}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="No matching activity" description="Adjust the filters to see more events." />
      ) : (
        // A table from sm up; on phones each event becomes a card (same markup).
        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm max-sm:block sm:min-w-[900px]">
              <thead className="max-sm:hidden">
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">Details</th>
                  <th className="px-3 py-2.5 font-medium">Creative</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y max-sm:block">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:px-4 max-sm:py-3">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground max-sm:order-1 max-sm:ml-auto max-sm:p-0" title={formatDateTime(r.createdAt)}>
                      <span className="max-sm:hidden">
                        {formatDateTime(r.createdAt)}
                        <br />
                      </span>
                      {timeAgo(r.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 max-sm:min-w-0 max-sm:flex-1 max-sm:p-0">
                      {r.actor ? (
                        <span className="flex items-center gap-2">
                          <UserAvatar name={r.actor.name} className="size-6 text-[10px]" />
                          <span className="min-w-0">
                            <span className="block truncate">{r.actor.name}</span>
                            <span className="block truncate text-xs text-muted-foreground max-sm:hidden">{r.actor.email}</span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">System</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 max-sm:order-2 max-sm:basis-full max-sm:p-0">
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">{ACTIVITY_LABELS[r.action]}</span>
                    </td>
                    <td className="max-w-md px-3 py-2.5 max-sm:order-3 max-sm:basis-full max-sm:p-0">{r.summary}</td>
                    <td className="max-w-[200px] px-3 py-2.5 max-sm:order-4 max-sm:max-w-none max-sm:basis-full max-sm:p-0 max-sm:text-xs">
                      {r.creative ? (
                        <Link href={`/creatives/${r.creative.id}`} className="block truncate hover:text-primary">
                          {r.creative.name}
                        </Link>
                      ) : r.creativeId === null && r.entityType === "CREATIVE" ? (
                        <span className="text-xs text-muted-foreground">Deleted</span>
                      ) : (
                        <span className="text-xs text-muted-foreground max-sm:hidden">—</span>
                      )}
                      {r.application && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: r.application.brandColor }} />
                          {r.application.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground max-sm:hidden">{r.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <UrlPagination
        basePath="/activity"
        params={{ q: params.q, user: params.user, action: params.action, entity: params.entity, app: params.app, from: params.from, to: params.to }}
        page={params.page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </>
  );
}
