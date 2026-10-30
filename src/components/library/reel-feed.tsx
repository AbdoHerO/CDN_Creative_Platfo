"use client";

import { BookOpen, ChevronLeft, Download, FileText, Info, Pause, Play, Share2, Sparkles, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { BadgeChips } from "@/components/badges/badge-chip";
import { StatusBadge } from "@/components/creatives/status-badge";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/server/queries/library";

/**
 * Full-screen vertical feed for phones (TikTok / Reels style): one creative
 * per screen with snap scrolling, the visible video autoplays (sound on demand),
 * neighbours preload, and actions sit in a rail on the right. The phone's back
 * gesture closes it.
 */
export function ReelFeed({ items, startIndex, onClose }: { items: LibraryItem[]; startIndex: number; onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Lock the page behind the feed.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Back gesture / button closes the feed.
  useEffect(() => {
    window.history.pushState({ ...window.history.state, reelFeed: true }, "");
    const onPop = () => closeRef.current();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(closeRef.current);
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = startIndex * el.clientHeight;
  }, [startIndex]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const next = Math.round(el.scrollTop / el.clientHeight);
    if (next !== index) setIndex(Math.max(0, Math.min(items.length - 1, next)));
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black text-white" role="dialog" aria-modal="true" aria-label="Creative feed" data-testid="reel-feed">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <Slide key={item.fileId} item={item} active={i === index} near={Math.abs(i - index) <= 1} muted={muted} onToggleMute={() => setMuted((m) => !m)} />
        ))}
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-black/60 to-transparent px-3 pb-8 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={() => close(onClose)}
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-black/30 backdrop-blur-md active:scale-95"
          aria-label="Close"
          data-testid="feed-close"
        >
          <ChevronLeft className="size-6" />
        </button>
        <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur-md">
          {index + 1} / {items.length}
        </span>
        <span className="size-10" />
      </div>
    </div>,
    document.body,
  );
}

/** Close through history so the entry pushed on open is consumed (popstate then closes). */
function close(onClose: () => void) {
  if (window.history.state?.reelFeed) window.history.back();
  else onClose();
}

function Slide({
  item,
  active,
  near,
  muted,
  onToggleMute,
}: {
  item: LibraryItem;
  active: boolean;
  near: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const isVideo = item.mediaType === "VIDEO" && !!item.hoverVideoUrl;
  const href = item.versionType === "PREVIEW" ? `/creatives/${item.creativeId}?file=${item.fileId}` : `/creatives/${item.creativeId}`;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => setPaused(true));
    } else {
      v.pause();
    }
  }, [active]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  const togglePlay = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const share = async () => {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) await navigator.share({ title: item.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied.");
      }
    } catch {
      // Sharing was cancelled.
    }
  };

  const duration = item.mediaType === "VIDEO" ? formatDuration(item.durationSeconds) : null;
  const picture = item.imageUrl ?? item.thumbnailUrl;

  return (
    <section className="relative h-dvh w-full snap-start snap-always overflow-hidden" aria-label={item.name}>
      {item.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbnailUrl} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl" />
      )}

      {isVideo ? (
        <video
          ref={video}
          src={near ? item.hoverVideoUrl! : undefined}
          poster={item.thumbnailUrl ?? undefined}
          playsInline
          loop
          muted={muted}
          // Neighbours buffer ahead only when they play a light file (lite version or
          // streaming copy): a full original (10–25 Mbps) would take the bandwidth of the video on screen.
          preload={active || (near && item.lightVideo) ? "auto" : near ? "metadata" : "none"}
          onClick={togglePlay}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          className="absolute inset-0 size-full object-contain"
        />
      ) : picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt={item.name} className="absolute inset-0 size-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/40">
          <FileText className="size-16" strokeWidth={1} />
        </div>
      )}

      {isVideo && paused && active && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 ring-1 ring-white/25 backdrop-blur-md"
          aria-label="Play"
        >
          <Play className="ml-1 size-9 fill-current" />
        </button>
      )}

      {item.mediaType === "DOCUMENT" && (
        <Link
          href={href}
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 shadow-2xl active:scale-95"
        >
          <BookOpen className="size-4" /> Read document
        </Link>
      )}

      {/* Right action rail */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+7rem)] right-2 flex flex-col items-center gap-4">
        <RailAction label="Details" href={href}>
          <Info />
        </RailAction>
        <RailAction label="Download" href={`/api/files/${item.fileId}/download`} external>
          <Download />
        </RailAction>
        {isVideo && (
          <RailAction label={muted ? "Sound" : "Mute"} onClick={onToggleMute}>
            {muted ? <VolumeX /> : <Volume2 />}
          </RailAction>
        )}
        {isVideo && (
          <RailAction label={paused ? "Play" : "Pause"} onClick={togglePlay}>
            {paused ? <Play /> : <Pause />}
          </RailAction>
        )}
        <RailAction label="Share" onClick={share}>
          <Share2 />
        </RailAction>
      </div>

      {/* Bottom details */}
      <div className="absolute inset-x-0 bottom-0 space-y-2 bg-linear-to-t from-black/90 via-black/55 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pr-20 pt-24">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 py-0.5 pl-1 pr-2.5 text-xs font-semibold backdrop-blur-md">
            <span className="size-4 rounded-full ring-2 ring-white/25" style={{ backgroundColor: item.application.brandColor }} />
            {item.application.name}
          </span>
          <StatusBadge status={item.status} className="border-0" />
          {item.hasPreview && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md">
              <Sparkles className="size-3" /> LITE
            </span>
          )}
        </div>
        <Link href={href} className="block text-base font-bold leading-snug drop-shadow-md">
          {item.name}
        </Link>
        <BadgeChips badges={item.badges} solid />
        <p className="text-xs text-white/70">
          {[duration && duration !== "—" ? duration : null, item.pageCount ? `${item.pageCount} pages` : null, item.extension.toUpperCase(), formatBytes(item.sizeBytes)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {isVideo && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
          <span className="block h-full bg-white" style={{ width: `${progress * 100}%` }} />
        </span>
      )}
    </section>
  );
}

function RailAction({
  label,
  href,
  external,
  onClick,
  children,
}: {
  label: string;
  href?: string;
  /** A file download, not an app page. */
  external?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-black/35 ring-1 ring-white/15 backdrop-blur-md transition-transform active:scale-90 [&_svg]:size-[22px]">
        {children}
      </span>
      <span className="text-[10px] font-semibold drop-shadow">{label}</span>
    </>
  );
  const cls = cn("flex flex-col items-center gap-1 text-white");
  if (href && external) {
    return (
      <a href={href} className={cls} aria-label={label}>
        {inner}
      </a>
    );
  }
  return href ? (
    <Link href={href} className={cls} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-label={label}>
      {inner}
    </button>
  );
}
