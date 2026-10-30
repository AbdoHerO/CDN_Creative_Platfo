import { AlertTriangle, CheckCircle2, FileArchive, Loader2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/common/auto-refresh";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ImportReview } from "@/components/imports/import-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requirePagePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatBytes, formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { applicationScope, campaignScope } from "@/lib/visibility";
import { listBadges } from "@/server/services/badges";

export const metadata: Metadata = { title: "ZIP import" };

export default async function ImportPage({ params }: PageProps<"/imports/[id]">) {
  const user = await requirePagePermission("import.create");
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: {
      application: { select: { name: true } },
      items: { orderBy: { entryPath: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!batch || (batch.createdById !== user.id && user.role !== "ADMIN")) notFound();

  const running = batch.status === "ANALYZING" || batch.status === "IMPORTING" || batch.status === "UPLOADING";
  const accepted = batch.items.filter((i) => i.status !== "REJECTED");
  const rejected = batch.items.filter((i) => i.status === "REJECTED");
  const imported = batch.items.filter((i) => i.status === "IMPORTED");
  const failed = batch.items.filter((i) => i.status === "FAILED");
  const toImport = batch.items.filter((i) => i.include && i.status !== "REJECTED");

  let review: React.ReactNode = null;
  if (batch.status === "READY_FOR_REVIEW") {
    const [applications, campaigns, badges] = await Promise.all([
      prisma.application.findMany({
        where: { AND: [applicationScope(user), { status: "ACTIVE" }] },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, brandColor: true },
      }),
      prisma.campaign.findMany({ where: { AND: [campaignScope(user), { status: { not: "ARCHIVED" } }] }, orderBy: { name: "asc" }, select: { id: true, name: true, applicationId: true } }),
      listBadges(),
    ]);
    review = (
      <ImportReview
        batchId={batch.id}
        items={accepted.map((i) => ({
          id: i.id,
          entryPath: i.entryPath,
          filename: i.filename,
          sizeBytes: Number(i.sizeBytes),
          mediaType: i.mediaType,
          extension: i.extension,
          versionType: i.versionType,
          matchKey: i.matchKey,
          groupKey: i.groupKey,
          targetCreativeId: i.targetCreativeId,
          creativeName: i.creativeName,
          category: i.category,
          applicationId: i.applicationId ?? (i.newApplicationName ? null : batch.applicationId),
          newApplicationName: i.applicationId ? null : i.newApplicationName,
          campaignId: i.campaignId,
          badgeIds: i.badgeIds,
          suggestedApplicationId: i.suggestedApplicationId,
          suggestedCampaignId: i.suggestedCampaignId,
          needsReview: i.needsReview,
          note: i.note,
        }))}
        rejected={rejected.map((i) => ({ id: i.id, entryPath: i.entryPath, reason: i.rejectReason ?? "Rejected", sizeBytes: Number(i.sizeBytes) }))}
        applications={applications}
        campaigns={campaigns}
        canCreatePlatforms={can(user.role, "application.manage")}
        badges={badges}
        canCreateBadges={can(user.role, "badge.manage")}
      />
    );
  }

  return (
    <>
      {running && <AutoRefresh intervalMs={2500} />}
      <PageHeader
        breadcrumbs={[{ label: "Upload", href: "/upload?tab=zip" }, { label: "ZIP import" }]}
        title={batch.archiveFilename}
        description={`${formatBytes(batch.archiveSizeBytes)} · default application ${batch.application.name} · started ${formatDateTime(batch.createdAt)} by ${batch.createdBy?.name ?? "Unknown"}`}
      />

      {batch.status === "UPLOADING" && (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertTitle>Waiting for the archive upload to finish</AlertTitle>
          <AlertDescription>Keep the upload page open until the archive has been uploaded.</AlertDescription>
        </Alert>
      )}

      {batch.status === "ANALYZING" && (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-16 text-center">
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="font-medium">Analysing the archive…</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Every entry is checked for unsafe paths, unsupported formats and mismatched content. This page updates automatically.
          </p>
        </div>
      )}

      {batch.status === "IMPORTING" && (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="font-medium">Importing files into the library…</p>
          </div>
          <Progress value={toImport.length ? ((imported.length + failed.length) / toImport.length) * 100 : 0} className="h-2" />
          <p className="tabular text-sm text-muted-foreground">
            {imported.length} of {toImport.length} imported{failed.length ? ` · ${failed.length} failed` : ""}
          </p>
        </div>
      )}

      {(batch.status === "COMPLETED" || batch.status === "FAILED" || batch.status === "CANCELLED") && (
        <div className="space-y-6">
          {batch.status === "COMPLETED" ? (
            <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <CheckCircle2 className="text-emerald-600" />
              <AlertTitle>Import completed</AlertTitle>
              <AlertDescription>
                {batch.importedCount} file(s) were added to the library as drafts.
                {batch.keepArchive && batch.archiveKey ? " The original archive is kept as an import record." : ""}
              </AlertDescription>
            </Alert>
          ) : batch.status === "FAILED" ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>{batch.errorMessage ?? "The archive could not be imported."}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <XCircle />
              <AlertTitle>Import cancelled</AlertTitle>
              <AlertDescription>No files from this archive were added.</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Entries" value={batch.totalEntries} icon={FileArchive} />
            <StatCard label="Imported" value={batch.importedCount} icon={CheckCircle2} tone="emerald" />
            <StatCard label="Failed" value={batch.failedCount} icon={AlertTriangle} tone="rose" />
            <StatCard label="Skipped / rejected" value={batch.skippedCount} icon={XCircle} tone="zinc" />
          </div>
          {batch.items.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.items.map((i) => (
                    <tr key={i.id}>
                      <td className="max-w-[420px] truncate px-4 py-2" title={i.entryPath}>
                        {i.entryPath}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {i.status === "IMPORTED" && <span className="text-emerald-700 dark:text-emerald-300">Imported</span>}
                        {i.status === "FAILED" && <span className="text-destructive">Failed — {i.errorMessage}</span>}
                        {i.status === "REJECTED" && <span className="text-muted-foreground">Rejected — {i.rejectReason}</span>}
                        {(i.status === "SKIPPED" || (!i.include && i.status !== "REJECTED")) && <span className="text-muted-foreground">Skipped</span>}
                        {i.status === "PENDING" && <span className="text-muted-foreground">Not imported</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {i.createdCreativeId && (
                          <Button asChild size="xs" variant="ghost">
                            <Link href={`/creatives/${i.createdCreativeId}`}>Open</Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {review}
    </>
  );
}
