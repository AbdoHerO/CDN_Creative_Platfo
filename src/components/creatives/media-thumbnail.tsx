import { AlertTriangle, FileAudio, FileText, FileVideo, ImageIcon, Loader2, File } from "lucide-react";
import type { MediaType, ProcessingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const ICONS: Record<MediaType, typeof File> = {
  VIDEO: FileVideo,
  IMAGE: ImageIcon,
  DOCUMENT: FileText,
  AUDIO: FileAudio,
  OTHER: File,
};

/**
 * Thumbnail tile. Library thumbnails are small derived WebP images — the
 * original (often 100 MB+) is never loaded just to render a grid.
 */
export function MediaThumbnail({
  url,
  mediaType,
  processingStatus,
  extension,
  className,
  alt = "",
}: {
  url: string | null;
  mediaType: MediaType;
  processingStatus?: ProcessingStatus;
  extension?: string;
  className?: string;
  alt?: string;
}) {
  const Icon = ICONS[mediaType];
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cn("size-full", mediaType === "DOCUMENT" ? "object-contain p-2 drop-shadow-sm" : "object-cover")}
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          {processingStatus === "PENDING" || processingStatus === "PROCESSING" ? (
            <Loader2 className="size-6 animate-spin opacity-70" />
          ) : processingStatus === "FAILED" ? (
            <AlertTriangle className="size-6 text-amber-500" />
          ) : (
            <Icon className="size-7 opacity-60" strokeWidth={1.5} />
          )}
          {extension && <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{extension}</span>}
        </div>
      )}
    </div>
  );
}
