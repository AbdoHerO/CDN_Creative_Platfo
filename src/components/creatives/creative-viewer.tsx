"use client";

import { AlertTriangle, Download, FileAudio, FileQuestion, Gauge, Loader2 } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreativeDetailFile } from "@/server/queries/creative-detail";
import { ImageZoomViewer } from "./image-zoom-viewer";
import { PdfReader } from "./pdf-reader";
import { VideoPlayer } from "./video-player";

type Quality = "smooth" | "original";

const QUALITY_KEY = "creative-hub:video-quality";
const QUALITY_EVENT = "creative-hub:video-quality";
let chosenQuality: Quality | null = null;

function savedQuality(): Quality | null {
  if (chosenQuality) return chosenQuality;
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === "smooth" || v === "original" ? v : null;
  } catch {
    return null;
  }
}

/** Phones, tablets and slow or data-saving connections start on the light copy; computers on the original. */
function defaultQuality(): Quality {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || (conn?.effectiveType && conn.effectiveType !== "4g")) return "smooth";
  return window.matchMedia("(max-width: 1023px), (pointer: coarse)").matches ? "smooth" : "original";
}

function subscribeQuality(onChange: () => void) {
  window.addEventListener(QUALITY_EVENT, onChange);
  return () => window.removeEventListener(QUALITY_EVENT, onChange);
}

function chooseQuality(q: Quality) {
  chosenQuality = q;
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
  window.dispatchEvent(new Event(QUALITY_EVENT));
}

/**
 * Inline preview of a version — built-in video player, zoomable image viewer,
 * native PDF viewer, audio player — so nobody has to download to look.
 * Media streams from signed URLs with HTTP range support. Heavy videos also have
 * a streaming copy (720p, made by the worker): "Smooth" plays it, "Original"
 * plays the uploaded file; the choice is remembered on this device.
 */
export function CreativeViewer({ file, name }: { file: CreativeDetailFile; name: string }) {
  const [failed, setFailed] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const quality = useSyncExternalStore(subscribeQuality, () => savedQuality() ?? defaultQuality(), () => "smooth" as Quality);
  const [resume, setResume] = useState<{ at: number; play: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

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
    const originalPlays = file.browserPreviewable && !failed;
    const stream = streamFailed ? null : file.streamUrl;
    if (!originalPlays && !stream) {
      return fallback(
        failed
          ? "Your browser cannot play this video format. Download the original, or switch to the preview version if one exists."
          : `.${file.extension.toUpperCase()} videos cannot be played in browsers. Download the original or use the preview version.`,
      );
    }
    const useStream = !!stream && (quality === "smooth" || !originalPlays);
    const switchTo = (q: Quality) => {
      const el = box.current?.querySelector("video");
      setResume(el ? { at: el.currentTime, play: !el.paused } : null);
      chooseQuality(q);
    };
    return (
      <div ref={box}>
        <VideoPlayer
          key={`${file.id}:${useStream ? "stream" : "original"}`}
          src={useStream ? stream : file.mediaUrl}
          type={useStream ? "video/mp4" : file.mimeType === "video/quicktime" ? "video/mp4" : file.mimeType}
          poster={file.thumbnailUrl}
          title={name}
          startAt={resume?.at}
          autoPlay={resume?.play}
          onError={() => (useStream ? setStreamFailed(true) : setFailed(true))}
        />
        {stream && (
          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground" data-testid="video-quality">
            <Gauge className="size-3.5" />
            <span>Playback</span>
            <div role="radiogroup" aria-label="Playback quality" className="inline-flex rounded-full bg-muted p-0.5">
              {(
                [
                  { value: "smooth", label: "Smooth · 720p", title: "Light copy made for streaming: plays without waiting on mobile data" },
                  { value: "original", label: "Original", title: originalPlays ? "The uploaded file, full quality" : "This format only plays after download" },
                ] as const
              ).map((o) => {
                const on = (o.value === "smooth") === useStream;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={o.title}
                    disabled={o.value === "original" && !originalPlays}
                    onClick={() => !on && switchTo(o.value)}
                    className={cn(
                      "rounded-full px-2.5 py-1 font-medium transition-colors disabled:opacity-40",
                      on ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
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
