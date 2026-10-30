import Link from "next/link";
import { AppBadge } from "@/components/common/app-badge";
import { MediaThumbnail } from "@/components/creatives/media-thumbnail";
import { StatusBadge } from "@/components/creatives/status-badge";
import { CATEGORY_LABELS } from "@/lib/constants";
import { formatBytes, formatDate, formatDuration, formatResolution } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/server/queries/library";

function hrefFor(item: LibraryItem) {
  return item.versionType === "PREVIEW" ? `/creatives/${item.creativeId}?file=${item.fileId}` : `/creatives/${item.creativeId}`;
}

export function VersionChips({ versions, className }: { versions: LibraryItem["versions"]; className?: string }) {
  const chips = [
    versions.full > 0 && `Full${versions.full > 1 ? ` ×${versions.full}` : ""}`,
    versions.preview > 0 && `Preview${versions.preview > 1 ? ` ×${versions.preview}` : ""}`,
    versions.variant > 0 && `${versions.variant} variant${versions.variant > 1 ? "s" : ""}`,
  ].filter(Boolean) as string[];
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {chips.map((c) => (
        <span key={c} className="rounded border bg-muted/50 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
          {c}
        </span>
      ))}
    </span>
  );
}

function PreviewLabel() {
  return (
    <span className="rounded bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-background">PREVIEW</span>
  );
}

export function CreativeGrid({ items }: { items: LibraryItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[1800px]:grid-cols-5">
      {items.map((item) => {
        const meta = item.mediaType === "VIDEO" ? formatDuration(item.durationSeconds) : formatResolution(item.width, item.height);
        return (
          <li key={item.fileId}>
            <Link
              href={hrefFor(item)}
              className={cn(
                "group flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:-translate-y-px hover:border-foreground/15 hover:shadow-md",
                item.versionType === "PREVIEW" && "border-dashed",
              )}
            >
              <div className="relative">
                <MediaThumbnail
                  url={item.thumbnailUrl}
                  mediaType={item.mediaType}
                  processingStatus={item.processingStatus}
                  extension={item.extension}
                  className="aspect-video w-full border-b"
                />
                <div className="absolute left-2 top-2 flex gap-1">
                  {item.versionType === "PREVIEW" && <PreviewLabel />}
                </div>
                <StatusBadge status={item.status} className="absolute right-2 top-2 shadow-xs" />
                {meta && meta !== "—" && (
                  <span className="tabular absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {meta}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium group-hover:text-primary" title={item.name}>
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" title={item.originalFilename}>
                    {item.originalFilename}
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <AppBadge name={item.application.name} color={item.application.brandColor} />
                  {item.campaign && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="truncate text-xs text-muted-foreground">{item.campaign.name}</span>
                    </>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <span className="truncate">
                    {CATEGORY_LABELS[item.category]} · <span className="uppercase">{item.extension}</span> · {formatBytes(item.sizeBytes)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {item.uploadedBy?.name ?? "Unknown"} · {formatDate(item.createdAt)}
                  </span>
                  <VersionChips versions={item.versions} className="shrink-0 justify-end" />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CreativeList({ items }: { items: LibraryItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Creative</th>
              <th className="px-3 py-2.5 font-medium">Application · Campaign</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">File</th>
              <th className="px-3 py-2.5 font-medium">Versions</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Uploaded</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.fileId} className="group transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <Link href={hrefFor(item)} className="flex items-center gap-3">
                    <MediaThumbnail
                      url={item.thumbnailUrl}
                      mediaType={item.mediaType}
                      processingStatus={item.processingStatus}
                      className="h-10 w-16 shrink-0 rounded-md border"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium group-hover:text-primary">{item.name}</span>
                        {item.versionType === "PREVIEW" && <PreviewLabel />}
                      </span>
                      <span className="block max-w-[280px] truncate text-xs text-muted-foreground">{item.originalFilename}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <AppBadge name={item.application.name} color={item.application.brandColor} />
                  <span className="block truncate text-xs text-muted-foreground">{item.campaign?.name ?? "No campaign"}</span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{CATEGORY_LABELS[item.category]}</td>
                <td className="tabular px-3 py-2.5 text-muted-foreground">
                  <span className="uppercase">{item.extension}</span> · {formatBytes(item.sizeBytes)}
                </td>
                <td className="px-3 py-2.5">
                  <VersionChips versions={item.versions} />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  <span className="block">{item.uploadedBy?.name ?? "Unknown"}</span>
                  <span className="block">{formatDate(item.createdAt)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
