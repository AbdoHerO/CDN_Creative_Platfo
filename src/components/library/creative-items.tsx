import Link from "next/link";
import { BadgeChips } from "@/components/badges/badge-chip";
import { AppBadge } from "@/components/common/app-badge";
import { MediaThumbnail } from "@/components/creatives/media-thumbnail";
import { StatusBadge } from "@/components/creatives/status-badge";
import { CATEGORY_LABELS } from "@/lib/constants";
import { formatBytes, formatDate } from "@/lib/format";
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
    <span
      className="rounded bg-foreground/85 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-background"
      title="Lite version of the full video"
    >
      PREVIEW · LITE
    </span>
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
                      <BadgeChips badges={item.badges} max={4} className="mt-1" />
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
