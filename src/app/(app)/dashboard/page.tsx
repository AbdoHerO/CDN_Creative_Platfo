import {
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  FileVideo,
  ImageIcon,
  Layers,
  PanelsTopLeft,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ColumnChart } from "@/components/charts/column-chart";
import { HorizontalBars } from "@/components/charts/horizontal-bars";
import { Meter } from "@/components/charts/meter";
import { AppBadge } from "@/components/common/app-badge";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { MediaThumbnail } from "@/components/creatives/media-thumbnail";
import { StatusBadge } from "@/components/creatives/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { isStorageConfigured } from "@/lib/env";
import { formatBytes, formatNumber, timeAgo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getDashboardData } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const sp = await searchParams;
  const [data, settings] = await Promise.all([getDashboardData(user), getSettings()]);
  const t = data.totals;
  const thresholdBytes = settings.storageWarningThresholdGb * 1024 ** 3;
  const storedBytes = data.storage.originalBytes + data.storage.derivedBytes;
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={user.role === "VIEWER" ? "An overview of approved creatives available to you." : "Live overview of creatives, validation and storage across all applications."}
        actions={
          can(user.role, "creative.upload") && (
            <Button asChild>
              <Link href="/upload">Upload creatives</Link>
            </Button>
          )
        }
      />
      {sp.denied && (
        <Alert className="mb-6" variant="destructive">
          <ShieldAlert />
          <AlertDescription>You do not have permission to open that page.</AlertDescription>
        </Alert>
      )}

      <section aria-label="Key figures" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total creatives" value={t.total} icon={Layers} href="/library" />
        <StatCard label="Videos" value={t.videos} icon={FileVideo} href="/library?type=VIDEO" />
        <StatCard label="Images" value={t.images} icon={ImageIcon} href="/library?type=IMAGE" />
        <StatCard label="Banners" value={t.banners} icon={PanelsTopLeft} href="/library?category=BANNER" />
        <StatCard label="Approved" value={t.APPROVED} icon={CheckCircle2} tone="emerald" href="/approved" />
        {user.role !== "VIEWER" && (
          <>
            <StatCard label="Pending validation" value={t.PENDING} icon={Clock} tone="amber" href="/validation" />
            <StatCard label="In review" value={t.IN_REVIEW} icon={Eye} tone="sky" href="/validation?tab=IN_REVIEW" />
            <StatCard label="Declined" value={t.DECLINED} icon={XCircle} tone="rose" href="/declined" />
            <StatCard label="Archived" value={t.ARCHIVED} icon={Archive} tone="zinc" href="/archived" />
            <StatCard label="Drafts" value={t.DRAFT} icon={Layers} tone="zinc" href="/library?status=DRAFT" />
          </>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Uploads per day</CardTitle>
            <CardDescription>New creatives over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart data={data.uploadsPerDay} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Storage usage</CardTitle>
            <CardDescription>
              {isStorageConfigured() ? "Originals and generated previews in RustFS (S3) storage" : "Storage is not configured"}
            </CardDescription>
            {can(user.role, "storage.view") && (
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/storage">Details</Link>
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="tabular text-3xl font-semibold tracking-tight">{formatBytes(storedBytes)}</p>
              <p className="text-xs text-muted-foreground">
                of {formatNumber(settings.storageWarningThresholdGb)} GB warning threshold · {formatNumber(data.storage.fileCount)} files
              </p>
            </div>
            <Meter value={storedBytes} max={thresholdBytes} label="Storage used against threshold" />
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Full versions</dt>
                <dd className="tabular font-medium">{formatBytes(data.storage.fullBytes)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Preview versions</dt>
                <dd className="tabular font-medium">{formatBytes(data.storage.previewBytes)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Variants</dt>
                <dd className="tabular font-medium">{formatBytes(data.storage.variantBytes)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Thumbnails & renditions</dt>
                <dd className="tabular font-medium">{formatBytes(data.storage.derivedBytes)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Creatives by application</CardTitle>
            <CardDescription>{formatNumber(t.total)} creatives in total</CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              label="Creatives by application"
              rows={data.perApplication.map((a) => ({
                key: a.id,
                text: a.name,
                label: <AppBadge name={a.name} color={a.brandColor} size="md" className="text-foreground" />,
                value: a.count,
                href: `/applications/${a.id}`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Creatives by status</CardTitle>
            <CardDescription>Where every creative sits in the validation workflow</CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              label="Creatives by status"
              rows={STATUS_ORDER.filter((s) => user.role !== "VIEWER" || s === "APPROVED").map((s) => ({
                key: s,
                text: STATUS_LABELS[s],
                label: <StatusBadge status={s} />,
                value: t[s],
                href: s === "PENDING" || s === "IN_REVIEW" ? "/validation" : s === "DRAFT" ? "/library?status=DRAFT" : `/${s.toLowerCase()}`,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pending validation</CardTitle>
            <CardDescription>
              {t.PENDING + t.IN_REVIEW} waiting · oldest first
            </CardDescription>
            {user.role !== "VIEWER" && (
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/validation">Open queue</Link>
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {data.pendingOldest.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Nothing is waiting for validation.</p>
            ) : (
              <ul className="divide-y">
                {data.pendingOldest.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/creatives/${c.id}`} className="block truncate text-sm font-medium hover:text-primary">
                        {c.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        <AppBadge name={c.application.name} color={c.application.brandColor} /> · submitted {timeAgo(c.submittedAt)}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Recent uploads</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/library">View library</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.recentUploads.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No creatives uploaded yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {data.recentUploads.map((c) => (
                  <li key={c.id}>
                    <Link href={`/creatives/${c.id}`} className="group block">
                      <MediaThumbnail url={c.thumbnailUrl} mediaType={c.mediaType} processingStatus={c.processingStatus} className="aspect-video rounded-lg border" />
                      <p className="mt-1.5 truncate text-sm font-medium group-hover:text-primary">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.application.name} · {c.createdBy?.name ?? "Unknown"} · {timeAgo(c.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recently approved</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/approved">All approved</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.recentApproved.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No approved creatives yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.recentApproved.map((c) => (
                  <li key={c.id}>
                    <Link href={`/creatives/${c.id}`} className="group flex items-center gap-3">
                      <MediaThumbnail url={c.thumbnailUrl} mediaType={c.mediaType} className="h-10 w-16 shrink-0 rounded-md border" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.application.name} · approved {timeAgo(c.approvedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm">Recent activity</CardTitle>
            {can(user.role, "activity.view") && (
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/activity">Full history</Link>
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {data.activity.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="divide-y">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      {a.creativeId ? (
                        <Link href={`/creatives/${a.creativeId}`} className="hover:text-primary">
                          {a.summary}
                        </Link>
                      ) : (
                        a.summary
                      )}
                    </span>
                    <time className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
