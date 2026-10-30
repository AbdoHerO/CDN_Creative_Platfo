import { CheckCircle2, Download, ExternalLink, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppBadge } from "@/components/common/app-badge";
import { PageHeader } from "@/components/common/page-header";
import { CreativeMoreActions } from "@/components/creatives/creative-more-actions";
import { CreativeViewer } from "@/components/creatives/creative-viewer";
import { EditCreativeDialog } from "@/components/creatives/edit-creative-dialog";
import { LinkPreviewCard } from "@/components/creatives/link-preview-card";
import { StatusBadge } from "@/components/creatives/status-badge";
import { UploadVersionDialog } from "@/components/creatives/upload-version-dialog";
import { ValidationTimeline } from "@/components/creatives/validation-timeline";
import { VersionActions } from "@/components/creatives/version-actions";
import { WorkflowActions } from "@/components/creatives/workflow-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireUser } from "@/lib/auth/current-user";
import { CATEGORY_LABELS, CHANNEL_LABELS, VERSION_TYPE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatBytes, formatDate, formatDateTime, formatDuration, formatResolution, timeAgo } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { getCreativeDetail, type CreativeDetailFile } from "@/server/queries/creative-detail";

export async function generateMetadata({ params }: PageProps<"/creatives/[id]">): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.creative.findUnique({ where: { id }, select: { name: true } });
  return { title: c?.name ?? "Creative" };
}

export default async function CreativePage({ params, searchParams }: PageProps<"/creatives/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const creative = await getCreativeDetail(user, id);
  if (!creative) notFound();

  const selected: CreativeDetailFile | undefined =
    creative.files.find((f) => f.id === sp.file) ??
    creative.files.find((f) => f.versionType === "FULL" && f.isCurrent) ??
    creative.files.find((f) => f.versionType === "PREVIEW" && f.isCurrent) ??
    creative.files[0];

  const [campaigns, tags, settings] = creative.permissions.canEdit
    ? await Promise.all([
        prisma.campaign.findMany({ where: { applicationId: creative.application.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, take: 500 }),
        getSettings(),
      ])
    : [[], [], null];

  const currentVersions = (["FULL", "PREVIEW", "VARIANT"] as const).flatMap((t) => creative.files.filter((f) => f.versionType === t && f.isCurrent));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Library", href: "/library" },
          { label: creative.application.name, href: `/applications/${creative.application.id}` },
          ...(creative.campaign ? [{ label: creative.campaign.name, href: `/campaigns/${creative.campaign.id}` }] : []),
          { label: creative.name },
        ]}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <span className="truncate">{creative.name}</span>
            <StatusBadge status={creative.status} className="h-6 px-2.5 text-xs" />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <AppBadge name={creative.application.name} color={creative.application.brandColor} size="md" />
            <span className="text-muted-foreground/50">·</span>
            <span>{CATEGORY_LABELS[creative.category]}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>
              Uploaded by {creative.createdBy?.name ?? "Unknown"} {timeAgo(creative.createdAt)}
            </span>
          </span>
        }
        actions={
          <>
            <WorkflowActions creativeId={creative.id} actions={creative.permissions.workflowActions} />
            {creative.permissions.canEdit && (
              <UploadVersionDialog
                creativeId={creative.id}
                applicationId={creative.application.id}
                resetsApproval={creative.status === "APPROVED" && (settings?.resetApprovalOnNewVersion ?? true)}
              />
            )}
            {creative.permissions.canEdit && (
              <EditCreativeDialog
                creative={{
                  id: creative.id,
                  name: creative.name,
                  description: creative.description,
                  campaignId: creative.campaign?.id ?? null,
                  category: creative.category,
                  channels: creative.channels,
                  tags: creative.tags.map((t) => t.name),
                  keywords: creative.keywords,
                }}
                campaigns={campaigns}
                tagSuggestions={tags.map((t) => t.name)}
              />
            )}
            <CreativeMoreActions
              creativeId={creative.id}
              name={creative.name}
              actions={creative.permissions.workflowActions}
              canDelete={creative.permissions.canDelete}
            />
          </>
        }
      />

      {!creative.hasFull && (
        <div className="mb-6">
          <LinkPreviewCard
            creativeId={creative.id}
            applicationId={creative.application.id}
            fileIds={creative.files.map((f) => f.id)}
            targets={creative.linkTargets}
            canEdit={creative.permissions.canEdit}
          />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {/* Version selector: one entry per current version, each with preview + download. */}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Versions">
            {currentVersions.map((f) => {
              const active = f.id === selected?.id;
              return (
                <div
                  key={f.id}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border bg-card pl-3 pr-1 shadow-xs transition-colors",
                    active ? "border-primary ring-2 ring-primary/15" : "hover:border-foreground/20",
                  )}
                >
                  <Link href={`/creatives/${creative.id}?file=${f.id}`} scroll={false} role="tab" aria-selected={active} className="py-2 text-sm" data-testid={`version-${f.versionType}`}>
                    <span className="font-semibold uppercase tracking-wide">{VERSION_TYPE_LABELS[f.versionType]} version</span>
                    {f.label && <span className="text-muted-foreground"> · {f.label}</span>}
                    <span className="text-muted-foreground"> — {formatBytes(f.sizeBytes)}</span>
                    {creative.approvedFileId === f.id && <CheckCircle2 className="ml-1.5 inline size-3.5 text-emerald-600" aria-label="Approved version" />}
                  </Link>
                  <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${VERSION_TYPE_LABELS[f.versionType]} version`}>
                    <a href={`/api/files/${f.id}/download`}>
                      <Download />
                    </a>
                  </Button>
                </div>
              );
            })}
          </div>

          {selected ? (
            <>
              <CreativeViewer file={selected} name={creative.name} />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{selected.originalFilename}</p>
                  <p className="text-xs text-muted-foreground">
                    {VERSION_TYPE_LABELS[selected.versionType]} v{selected.versionNumber}
                    {!selected.isCurrent && " (previous version)"} · {formatBytes(selected.sizeBytes)} · uploaded {formatDate(selected.createdAt)} by{" "}
                    {selected.uploadedBy?.name ?? "Unknown"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/files/${selected.id}/preview`} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open original
                    </a>
                  </Button>
                  <Button asChild size="sm">
                    <a href={`/api/files/${selected.id}/download`} data-testid="download-selected">
                      <Download /> Download original
                    </a>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This creative has no files yet.</p>
          )}

          <Tabs defaultValue="versions" className="pt-2">
            <TabsList>
              <TabsTrigger value="versions">Versions ({creative.files.length})</TabsTrigger>
              <TabsTrigger value="validation">Validation history ({creative.validations.length})</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="versions">
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Version</th>
                        <th className="px-3 py-2 font-medium">File</th>
                        <th className="px-3 py-2 font-medium">Size</th>
                        <th className="px-3 py-2 font-medium">Details</th>
                        <th className="px-3 py-2 font-medium">Uploaded</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {creative.files.map((f) => (
                        <tr key={f.id} className={cn(f.id === selected?.id && "bg-accent/40")}>
                          <td className="px-4 py-2.5">
                            <Link href={`/creatives/${creative.id}?file=${f.id}`} scroll={false} className="font-medium hover:text-primary">
                              {VERSION_TYPE_LABELS[f.versionType]} v{f.versionNumber}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {f.isCurrent && <span className="rounded bg-primary/10 px-1.5 text-[10px] font-medium text-primary">CURRENT</span>}
                              {creative.approvedFileId === f.id && (
                                <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">APPROVED</span>
                              )}
                              {f.label && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{f.label}</span>}
                            </div>
                          </td>
                          <td className="max-w-[240px] truncate px-3 py-2.5 text-muted-foreground" title={f.originalFilename}>
                            {f.originalFilename}
                          </td>
                          <td className="tabular whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatBytes(f.sizeBytes)}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {[formatResolution(f.width, f.height), f.durationSeconds ? formatDuration(f.durationSeconds) : null, f.extension.toUpperCase()]
                              .filter(Boolean)
                              .join(" · ")}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">
                            {formatDate(f.createdAt)}
                            <br />
                            {f.uploadedBy?.name ?? "Unknown"}
                          </td>
                          <td className="px-3 py-2.5">
                            <VersionActions
                              file={f}
                              creativeId={creative.id}
                              applicationId={creative.application.id}
                              canEdit={creative.permissions.canEdit}
                              canDelete={creative.permissions.canEdit && creative.files.length > 1}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="validation">
              <ValidationTimeline items={creative.validations} files={creative.files} />
            </TabsContent>
            <TabsContent value="activity">
              {creative.activities.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {creative.activities.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="min-w-0">{a.summary}</span>
                      <time className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(a.createdAt)}>
                        {timeAgo(a.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <Detail label="Application">
                  <Link href={`/applications/${creative.application.id}`} className="hover:text-primary">
                    <AppBadge name={creative.application.name} color={creative.application.brandColor} size="md" className="text-foreground" />
                  </Link>
                </Detail>
                <Detail label="Campaign">
                  {creative.campaign ? (
                    <Link href={`/campaigns/${creative.campaign.id}`} className="hover:text-primary">
                      {creative.campaign.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </Detail>
                <Detail label="Category">{CATEGORY_LABELS[creative.category]}</Detail>
                <Detail label="Platforms">
                  {creative.channels.length ? creative.channels.map((c) => CHANNEL_LABELS[c]).join(", ") : <span className="text-muted-foreground">—</span>}
                </Detail>
                <Detail label="Tags">
                  {creative.tags.length ? (
                    <span className="flex flex-wrap gap-1">
                      {creative.tags.map((t) => (
                        <Link key={t.slug} href={`/library?tag=${t.slug}`} className="rounded-md bg-secondary px-1.5 py-0.5 text-xs hover:bg-accent">
                          {t.name}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Detail>
                {creative.keywords.length > 0 && <Detail label="Keywords">{creative.keywords.join(", ")}</Detail>}
                <Detail label="Uploaded by">{creative.createdBy?.name ?? "Unknown"}</Detail>
                <Detail label="Upload date">{formatDateTime(creative.createdAt)}</Detail>
                <Detail label="Last updated">{formatDateTime(creative.updatedAt)}</Detail>
                {creative.approvedAt && <Detail label="Approved">{formatDateTime(creative.approvedAt)}</Detail>}
                {creative.description && (
                  <div className="space-y-1 border-t pt-3">
                    <dt className="text-xs text-muted-foreground">Description</dt>
                    <dd className="whitespace-pre-wrap">{creative.description}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {selected && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-sm">File metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  <Detail label="Filename">
                    <span className="break-all">{selected.originalFilename}</span>
                  </Detail>
                  <Detail label="Version">
                    {VERSION_TYPE_LABELS[selected.versionType]} v{selected.versionNumber}
                  </Detail>
                  <Detail label="Size">
                    <span className="tabular">
                      {formatBytes(selected.sizeBytes)} ({selected.sizeBytes.toLocaleString("en-US")} bytes)
                    </span>
                  </Detail>
                  <Detail label="Format">
                    {selected.extension.toUpperCase()} · {selected.mimeType}
                  </Detail>
                  {formatResolution(selected.width, selected.height) && <Detail label="Resolution">{formatResolution(selected.width, selected.height)}</Detail>}
                  {selected.durationSeconds != null && <Detail label="Duration">{formatDuration(selected.durationSeconds)}</Detail>}
                  {selected.frameRate != null && <Detail label="Frame rate">{selected.frameRate} fps</Detail>}
                  {(selected.videoCodec || selected.audioCodec) && (
                    <Detail label="Codecs">{[selected.videoCodec, selected.audioCodec].filter(Boolean).join(" / ")}</Detail>
                  )}
                  {selected.bitrate != null && <Detail label="Bitrate">{(selected.bitrate / 1_000_000).toFixed(2)} Mbps</Detail>}
                  {selected.pageCount != null && <Detail label="Pages">{selected.pageCount}</Detail>}
                  <Detail label="Integrity">
                    <IntegrityBadge status={selected.integrityStatus} />
                  </Detail>
                  {selected.verifiedSha256 && (
                    <Detail label="SHA-256">
                      <code className="break-all text-[11px] text-muted-foreground">{selected.verifiedSha256}</code>
                    </Detail>
                  )}
                  <Detail label="Processing">
                    <span className={cn(selected.processingStatus === "FAILED" && "text-destructive")}>
                      {selected.processingStatus === "READY" ? "Ready" : selected.processingStatus === "FAILED" ? "Failed" : "In progress…"}
                    </span>
                    {selected.processingError && <p className="mt-1 text-xs text-muted-foreground">{selected.processingError}</p>}
                  </Detail>
                </dl>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3">
      <dt className="text-xs leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function IntegrityBadge({ status }: { status: CreativeDetailFile["integrityStatus"] }) {
  if (status === "VERIFIED")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="size-4" /> Verified — identical to the uploaded file
      </span>
    );
  if (status === "MISMATCH")
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <ShieldAlert className="size-4" /> Checksum mismatch — re-upload required
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <ShieldQuestion className="size-4" /> {status === "PENDING" ? "Verification pending" : "Not verified"}
    </span>
  );
}
