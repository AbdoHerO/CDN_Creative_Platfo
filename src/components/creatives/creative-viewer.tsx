"use client";

import { AlertTriangle, Download, FileAudio, FileQuestion, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CreativeDetailFile } from "@/server/queries/creative-detail";
import { ImageZoomViewer } from "./image-zoom-viewer";
import { PdfReader } from "./pdf-reader";
import { VideoPlayer } from "./video-player";

/**
 * Inline preview of a version — built-in video player, zoomable image viewer,
 * native PDF viewer, audio player — so nobody has to download to look.
 * Media streams from short-lived signed URLs with HTTP range support.
 */
export function CreativeViewer({ file, name }: { file: CreativeDetailFile; name: string }) {
  const [failed, setFailed] = useState(false);

  const fallback = (message: string) => (
    <div className="flex h-[min(60vh,560px)] flex-col items-center justify-center gap-4 rounded-xl border bg-muted/40 p-6 text-center">
      {file.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.thumbnailUrl} alt="" className="max-h-64 rounded-lg border object-contain shadow-sm" />
      ) : file.processingStatus === "PENDING" || file.processingStatus === "PROCESSING" ? (
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      ) : (
        <FileQuestion className="size-10 text-muted-foreground" strokeWidth={1.5} />
      )}
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/files/${file.id}/download`}>
            <Download /> Download original
          </a>
        </Button>
      </div>
    </div>
  );

  if (!file.mediaUrl) return fallback("Storage is not reachable right now, so a preview cannot be shown.");

  if (file.mediaType === "VIDEO") {
    if (failed || !file.browserPreviewable) {
      return fallback(
        failed
          ? "Your browser cannot play this video format. Download the original, or switch to the preview version if one exists."
          : `.${file.extension.toUpperCase()} videos cannot be played in browsers. Download the original or use the preview version.`,
      );
    }
    return (
      <VideoPlayer
        key={file.id}
        src={file.mediaUrl}
        type={file.mimeType === "video/quicktime" ? "video/mp4" : file.mimeType}
        poster={file.thumbnailUrl}
        title={name}
        onError={() => setFailed(true)}
      />
    );
  }

  if (file.mediaType === "IMAGE") {
    const src = file.displayUrl ?? (file.browserPreviewable ? file.mediaUrl : file.thumbnailUrl);
    if (!src) return fallback(file.processingStatus === "READY" ? "A preview could not be generated for this image format." : "Generating preview…");
    return <ImageZoomViewer key={file.id} src={src} alt={name} naturalWidth={file.displayUrl ? null : file.width} />;
  }

  if (file.mediaType === "DOCUMENT") {
    if (file.extension === "pdf") {
      return (
        <PdfReader
          key={file.id}
          src={file.mediaUrl}
          title={name}
          downloadHref={`/api/files/${file.id}/download`}
          openHref={`/api/files/${file.id}/preview`}
        />
      );
    }
    if (file.displayUrl) return <ImageZoomViewer key={file.id} src={file.displayUrl} alt={name} />;
    return fallback("This document format cannot be previewed in the browser.");
  }

  if (file.mediaType === "AUDIO") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-6 rounded-xl border bg-muted/40 p-6">
        <FileAudio className="size-12 text-muted-foreground" strokeWidth={1.25} />
        {failed ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" /> This audio format cannot be played in your browser.
          </p>
        ) : (
          <audio key={file.id} controls preload="metadata" src={file.mediaUrl} className="w-full max-w-lg" onError={() => setFailed(true)} />
        )}
      </div>
    );
  }

  return fallback("No inline preview is available for this file type.");
}
