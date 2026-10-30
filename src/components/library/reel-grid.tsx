"use client";

import { BookOpen, Check, FileAudio, FileText, ImageIcon, Loader2, Play, Sparkles, VolumeX } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeChips } from "@/components/badges/badge-chip";
import { StatusBadge } from "@/components/creatives/status-badge";
import { WorkflowActions } from "@/components/creatives/workflow-actions";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkflowAction } from "@/lib/workflow";
import type { LibraryItem } from "@/server/queries/library";
import { CardBadgeEditor, useLibraryEdit } from "./edit-mode";
import { ReelFeed } from "./reel-feed";

/** Seconds of the clip played (and looped) while hovering a card. */
const HOVER_SECONDS = 6;
/** Short delay so sweeping the mouse across the grid does not start every video. */
const HOVER_DELAY_MS = 150;
/** Phones open the full-screen feed instead of the details page. */
const FEED_QUERY = "(max-width: 767px)";

export type ReelShape = "portrait" | "landscape";

const GRID: Record<ReelShape, string> = {
  portrait: "grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 min-[1800px]:grid-cols-6",
  landscape: "grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4",
};

/**
 * Reels-style library grid: cards with the creative fitted on a blurred
 * backdrop, details over a gradient and a muted preview on hover (the lite
 * version when there is one). Tall 9:16 cards for videos, 4:3 for banners and
 * PDFs. On phones a tap opens a full-screen, swipeable feed.
 */
export function ReelGrid({
  items,
  shape = "portrait",
  actions,
}: {
  items: LibraryItem[];
  shape?: ReelShape;
  /** Workflow buttons shown under each card (validation queue). */
  actions?: Record<string, WorkflowAction[]>;
}) {
  const [feedIndex, setFeedIndex] = useState<number | null>(null);
  const closeFeed = useCallback(() => setFeedIndex(null), []);
  const { editing } = useLibraryEdit();
  return (
    <>
      <ul className={cn("grid", GRID[shape])} data-testid="reel-grid">
        {items.map((item, i) => (
          <li key={item.fileId} className="min-w-0">
            <ReelCard item={item} shape={shape} onOpenFeed={() => setFeedIndex(i)} />
            {editing ? (
              <CardBadgeEditor key={item.badges.map((b) => b.id).join()} creativeId={item.creativeId} badges={item.badges} />
            ) : (
              !!actions?.[item.creativeId]?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5 [&>button]:h-8 [&>button]:flex-1 [&>button]:px-2 [&>button]:text-xs">
                  <WorkflowActions
                    creativeId={item.creativeId}
                    actions={actions[item.creativeId]}
                    size="sm"
                    include={["submit", "startReview", "approve", "requestChanges", "decline", "withdraw"]}
                  />
                </div>
              )
            )}
          </li>
        ))}
      </ul>
      {feedIndex !== null && <ReelFeed items={items} startIndex={feedIndex} onClose={closeFeed} />}
    </>
  );
}

function ReelCard({ item, shape, onOpenFeed }: { item: LibraryItem; shape: ReelShape; onOpenFeed: () => void }) {
  const { editing, selected, toggle } = useLibraryEdit();
  const isSelected = editing && selected.has(item.creativeId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const canPreview = !!item.hoverVideoUrl;
  const href = item.versionType === "PREVIEW" ? `/creatives/${item.creativeId}?file=${item.fileId}` : `/creatives/${item.creativeId}`;

  const start = () => {
    // Touch screens fire mouse events on tap: hover previews are for real pointers only.
    if (!canPreview || !window.matchMedia("(hover: hover)").matches) return;
    timer.current = setTimeout(() => setActive(true), HOVER_DELAY_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setActive(false);
    setPlaying(false);
    setProgress(0);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!active || !v) return;
    v.muted = true;
    v.play().catch(() => setPlaying(false));
  }, [active]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onTime = () => {
    const v = videoRef.current;
    if (!v) return;
    const limit = Math.min(HOVER_SECONDS, v.duration || HOVER_SECONDS);
    if (v.currentTime >= limit) v.currentTime = 0;
    setProgress(Math.min(1, v.currentTime / limit));
  };

  const onClick = (e: React.MouseEvent) => {
    if (editing) {
      e.preventDefault();
      toggle(item.creativeId);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || !window.matchMedia(FEED_QUERY).matches) return;
    e.preventDefault();
    onOpenFeed();
  };

  const duration = item.mediaType === "VIDEO" ? formatDuration(item.durationSeconds) : null;
  const pages = item.mediaType === "DOCUMENT" && item.pageCount ? `${item.pageCount} page${item.pageCount === 1 ? "" : "s"}` : null;
  const Fallback = item.mediaType === "AUDIO" ? FileAudio : item.mediaType === "DOCUMENT" ? FileText : ImageIcon;

  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      className={cn(
        "group relative block overflow-hidden rounded-xl bg-neutral-950 shadow-sm ring-1 ring-black/5 outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20 focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] sm:rounded-2xl dark:ring-white/10",
        shape === "portrait" ? "aspect-[9/16]" : "aspect-[4/3]",
        isSelected && "ring-4 ring-primary",
      )}
      aria-pressed={editing ? isSelected : undefined}
      aria-label={`${item.name}, ${item.application.name}`}
      data-testid="reel-card"
    >
      {item.thumbnailUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumbnailUrl} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnailUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-contain transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-neutral-800 to-neutral-950 text-white/50">
          {item.processingStatus === "PENDING" || item.processingStatus === "PROCESSING" ? (
            <Loader2 className="size-7 animate-spin" />
          ) : (
            <Fallback className="size-9" strokeWidth={1.25} />
          )}
        </div>
      )}

      {active && item.hoverVideoUrl && (
        <video
          ref={videoRef}
          src={item.hoverVideoUrl}
          muted
          playsInline
          preload="auto"
          onPlaying={() => setPlaying(true)}
          onTimeUpdate={onTime}
          className={cn("absolute inset-0 size-full object-contain transition-opacity duration-300", playing ? "opacity-100" : "opacity-0")}
        />
      )}

      {editing && (
        <span
          className={cn(
            "absolute left-1/2 top-1/2 z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-2 ring-white transition-all",
            isSelected ? "bg-primary text-white" : "bg-black/35 text-transparent backdrop-blur-sm",
          )}
          aria-hidden
        >
          <Check className="size-5" strokeWidth={3} />
        </span>
      )}

      {/* Top: platform and status */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 bg-linear-to-b from-black/55 to-transparent p-2 pb-8 sm:p-2.5">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/45 py-0.5 pl-1 pr-2 text-[10px] font-medium text-white backdrop-blur-md sm:text-[11px]">
          <span className="size-3 shrink-0 rounded-full ring-2 ring-white/20 sm:size-3.5" style={{ backgroundColor: item.application.brandColor }} />
          <span className="truncate">{item.application.name}</span>
        </span>
        <StatusBadge status={item.status} className="shrink-0 border-0 shadow-xs" />
      </div>

      {/* Centre: play hint */}
      {item.mediaType === "VIDEO" && !playing && (
        <span
          className={cn(
            "absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-all duration-300 sm:size-12",
            active ? "scale-90 opacity-0" : "opacity-0 group-hover:opacity-100",
          )}
        >
          {active ? <Loader2 className="size-5 animate-spin" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </span>
      )}

      {/* Centre: document hint */}
      {item.mediaType === "DOCUMENT" && (
        <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white opacity-0 ring-1 ring-white/25 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
          <BookOpen className="size-4" /> Open
        </span>
      )}

      {/* Bottom: details */}
      <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-linear-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-12 text-white sm:space-y-2 sm:p-3 sm:pt-14">
        <BadgeChips badges={item.badges} solid max={shape === "portrait" ? 2 : 3} />
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug drop-shadow sm:text-sm" title={item.name}>
          {item.name}
        </p>
        <div className="flex items-center justify-between gap-2 text-[11px] text-white/75">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {duration && duration !== "—" && <span className="tabular rounded bg-white/15 px-1.5 py-px font-medium text-white">{duration}</span>}
            {pages && <span className="tabular rounded bg-white/15 px-1.5 py-px font-medium text-white">{pages}</span>}
            <span className="uppercase">{item.extension}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{formatBytes(item.sizeBytes)}</span>
          </span>
          {item.extension === "pdf" ? (
            <span className="shrink-0 rounded bg-rose-500 px-1.5 py-px text-[10px] font-bold tracking-wide text-white">PDF</span>
          ) : item.versionType === "PREVIEW" ? (
            <span className="shrink-0 rounded bg-white px-1.5 py-px text-[10px] font-bold tracking-wide text-black">PREVIEW · LITE</span>
          ) : (
            item.hasPreview && (
              <span className="flex shrink-0 items-center gap-1 rounded bg-white/15 px-1.5 py-px text-[10px] font-semibold" title="Has a lite (preview) version">
                <Sparkles className="size-3" /> LITE
              </span>
            )
          )}
        </div>
      </div>

      {/* Hover playback progress */}
      {active && playing && (
        <>
          <span className="absolute right-2.5 top-11 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur">
            <VolumeX className="size-3" /> Preview
          </span>
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
            <span className="block h-full bg-white transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
          </span>
        </>
      )}
    </Link>
  );
}
