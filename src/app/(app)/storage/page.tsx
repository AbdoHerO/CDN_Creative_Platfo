import { AlertTriangle, Archive, Database, FileStack, HardDrive, Layers, Loader2, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HorizontalBars } from "@/components/charts/horizontal-bars";
import { Meter } from "@/components/charts/meter";
import { AppBadge } from "@/components/common/app-badge";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ReconcileButton } from "@/components/storage/reconcile-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CreativeCategory } from "@/generated/prisma/enums";
import { requirePagePermission } from "@/lib/auth/current-user";
import { CATEGORY_LABELS, VERSION_TYPE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getStorageConfig } from "@/lib/env";
import { formatBytes, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { storageByApplication } from "@/server/queries/applications";

export const metadata: Metadata = { title: "Storage" };

export default async function StoragePage() {
  const user = await requirePagePermission("storage.view");
  const config = getStorageConfig();
  const [settings, originals, derived, byType, byCategory, byApp, apps, creativeCount, archives, largest, snapshot] = await Promise.all([
    getSettings(),
    prisma.creativeFile.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.creativeFile.aggregate({ _sum: { thumbnailBytes: true, displayBytes: true } }),
    prisma.creativeFile.groupBy({ by: ["versionType"], _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.$queryRaw<{ category: CreativeCategory; bytes: bigint | null; files: bigint }[]>`
      SELECT c."category", SUM(f."sizeBytes")::bigint AS bytes, COUNT(*)::bigint AS files
        FROM "CreativeFile" f JOIN "Creative" c ON c."id" = f."creativeId"
       GROUP BY c."category" ORDER BY bytes DESC`,
    storageByApplication(),
    prisma.application.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, brandColor: true } }),
    prisma.creative.count({ where: { files: { some: {} } } }),
    prisma.importBatch.aggregate({ where: { archiveKey: { not: null } }, _sum: { archiveSizeBytes: true }, _count: { _all: true } }),
    prisma.creativeFile.findMany({
      orderBy: { sizeBytes: "desc" },
      take: 10,
      select: { id: true, originalFilename: true, sizeBytes: true, versionType: true, versionNumber: true, creative: { select: { id: true, name: true, application: { select: { name: true, brandColor: true } } } } },
    }),
    prisma.storageSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const originalBytes = Number(originals._sum.sizeBytes ?? 0);
  const derivedBytes = Number(derived._sum.thumbnailBytes ?? 0) + Number(derived._sum.displayBytes ?? 0);
  const archiveBytes = Number(archives._sum.archiveSizeBytes ?? 0);
  const totalBytes = originalBytes + derivedBytes + archiveBytes;
  const gb = totalBytes / 1024 ** 3;
  const monthlyCost = gb * settings.storagePricePerGbMonth;
  const type = (t: string) => byType.find((r) => r.versionType === t);
  const details = snapshot?.details as { byPrefix?: Record<string, { objects: number; bytes: number }>; orphanSamples?: { key: string; size: number }[]; missingSamples?: string[] } | null;

  return (
    <>
      {snapshot?.status === "RUNNING" && <AutoRefresh intervalMs={3000} />}
      <PageHeader
        title="Storage"
        description="Usage computed from synchronised database records of every object stored in Cloudflare R2. Run a reconciliation to compare with the bucket itself."
        actions={can(user.role, "storage.manage") && config && <ReconcileButton disabled={snapshot?.status === "RUNNING"} />}
      />
      {!config && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>Cloudflare R2 is not configured</AlertTitle>
          <AlertDescription>Set the R2_* environment variables to enable uploads and storage reconciliation.</AlertDescription>
        </Alert>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total stored" value={formatBytes(totalBytes)} icon={HardDrive} hint={`${formatNumber(originals._count._all)} files · ${formatNumber(creativeCount)} creatives`} />
        <StatCard label="Full versions" value={formatBytes(Number(type("FULL")?._sum.sizeBytes ?? 0))} icon={Layers} tone="sky" hint={`${formatNumber(type("FULL")?._count._all ?? 0)} files`} />
        <StatCard label="Preview versions" value={formatBytes(Number(type("PREVIEW")?._sum.sizeBytes ?? 0))} icon={FileStack} tone="emerald" hint={`${formatNumber(type("PREVIEW")?._count._all ?? 0)} files`} />
        <StatCard
          label="Estimated monthly cost"
          value={`$${monthlyCost.toFixed(2)}`}
          icon={Receipt}
          tone="zinc"
          hint={`at $${settings.storagePricePerGbMonth}/GB-month (excl. free tier & operations)`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Capacity planning</CardTitle>
            <CardDescription>Against the {formatNumber(settings.storageWarningThresholdGb)} GB warning threshold (Settings)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="tabular text-3xl font-semibold tracking-tight">{gb >= 1 ? `${gb.toFixed(2)} GB` : formatBytes(totalBytes)}</p>
            <Meter value={totalBytes} max={settings.storageWarningThresholdGb * 1024 ** 3} label="Storage against threshold" />
            <dl className="space-y-2 text-sm">
              <Row label="Original files" value={formatBytes(originalBytes)} />
              <Row label={`${VERSION_TYPE_LABELS.VARIANT} versions`} value={formatBytes(Number(type("VARIANT")?._sum.sizeBytes ?? 0))} />
              <Row label="Thumbnails & display renditions" value={formatBytes(derivedBytes)} />
              <Row label={`Retained ZIP archives (${archives._count._all})`} value={formatBytes(archiveBytes)} />
            </dl>
            <p className="text-xs text-muted-foreground">
              R2 has no egress fees; storage is billed per GB-month. The architecture scales to many terabytes — only the threshold needs adjusting.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Storage by application</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              label="Storage by application"
              formatValue={formatBytes}
              rows={apps
                .map((a) => ({ key: a.id, label: <AppBadge name={a.name} color={a.brandColor} size="md" className="text-foreground" />, value: byApp.get(a.id) ?? 0, href: `/applications/${a.id}` }))
                .sort((a, b) => b.value - a.value)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Storage by category</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              label="Storage by category"
              formatValue={formatBytes}
              emptyText="No files stored yet."
              rows={byCategory.map((c) => ({ key: c.category, label: CATEGORY_LABELS[c.category], value: Number(c.bytes ?? 0), href: `/library?category=${c.category}` }))}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Largest files</CardTitle>
          </CardHeader>
          <CardContent>
            {largest.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">No files stored yet.</p>
            ) : (
              <ul className="divide-y">
                {largest.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/creatives/${f.creative.id}?file=${f.id}`} className="block truncate font-medium hover:text-primary">
                        {f.originalFilename}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {f.creative.name} · {VERSION_TYPE_LABELS[f.versionType]} v{f.versionNumber} · <AppBadge name={f.creative.application.name} color={f.creative.application.brandColor} />
                      </p>
                    </div>
                    <span className="tabular shrink-0 font-medium">{formatBytes(f.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bucket reconciliation</CardTitle>
            <CardDescription>
              {config ? (
                <>
                  Bucket <code className="text-xs">{config.bucket}</code> on {new URL(config.endpoint).host}
                </>
              ) : (
                "Not configured"
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!snapshot ? (
              <p className="text-muted-foreground">No reconciliation has been run yet.</p>
            ) : snapshot.status === "RUNNING" ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Listing bucket objects… started {timeAgo(snapshot.createdAt)}
              </p>
            ) : snapshot.status === "FAILED" ? (
              <p className="text-destructive">Failed: {snapshot.error}</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Last run {formatDateTime(snapshot.completedAt)}</p>
                <dl className="space-y-2">
                  <Row label="Objects in bucket" value={formatNumber(snapshot.totalObjects)} />
                  <Row label="Actual bucket size" value={formatBytes(snapshot.totalBytes)} />
                  <Row label="Difference vs records" value={formatBytes(Math.abs(Number(snapshot.totalBytes) - totalBytes))} />
                  <Row label="Orphaned objects" value={`${formatNumber(snapshot.orphanObjects)} · ${formatBytes(snapshot.orphanBytes)}`} warn={snapshot.orphanObjects > 0} />
                  <Row label="Missing originals" value={formatNumber(snapshot.missingObjects)} warn={snapshot.missingObjects > 0} />
                </dl>
                {details?.byPrefix && (
                  <div className="space-y-1 border-t pt-3">
                    {Object.entries(details.byPrefix).map(([prefix, v]) => (
                      <p key={prefix} className="flex justify-between text-xs text-muted-foreground">
                        <code>{prefix}</code>
                        <span className="tabular">
                          {formatNumber(v.objects)} · {formatBytes(v.bytes)}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                {(details?.missingSamples?.length ?? 0) > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Some database records point to objects that no longer exist in the bucket. Check the activity log and restore from backup if needed.
                  </p>
                )}
              </>
            )}
            <p className="flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
              <Database className="size-3.5" /> Figures above are computed from database records; reconciliation reads the bucket directly.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Archive className="size-3.5" /> Abandoned uploads are aborted automatically after the upload session TTL.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={warn ? "tabular font-medium text-amber-700 dark:text-amber-300" : "tabular font-medium"}>{value}</dd>
    </div>
  );
}
