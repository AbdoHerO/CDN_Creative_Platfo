"use client";

import { Clapperboard, FileText, ImageIcon, Layers, LayoutGrid, Sparkles, VideoOff } from "lucide-react";
import { brandInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LibraryCounts, LibraryKind } from "@/server/queries/library";
import { useLibraryUrl } from "./use-library-url";

type App = { id: string; name: string; brandColor: string };

const KINDS = [
  { value: "video", label: "Videos", icon: Clapperboard },
  { value: "banner", label: "Banners", icon: ImageIcon },
  { value: "pdf", label: "PDFs", icon: FileText },
  { value: "all", label: "All", icon: LayoutGrid },
] as const satisfies readonly { value: LibraryKind; label: string; icon: unknown }[];

const REVIEW = [
  { value: "", label: "All", dot: null, key: "all" },
  { value: "approved", label: "Approved", dot: "bg-emerald-500", key: "approved" },
  { value: "waiting", label: "Not yet", dot: "bg-amber-500", key: "waiting" },
  { value: "declined", label: "Declined", dot: "bg-rose-500", key: "declined" },
] as const;

const LITE = [
  { value: "", label: "All", icon: Layers, key: "all" },
  { value: "with", label: "With preview", icon: Sparkles, key: "with" },
  { value: "without", label: "Without preview", icon: VideoOff, key: "without" },
] as const;

/** Horizontal scroller without a visible scrollbar; vertical padding keeps rings and counters unclipped. */
const SCROLL_ROW = "-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Library banner: content tabs (videos by default, banners, PDFs, all), then
 * one-click filters by platform, validation state and lite version, each with
 * live counts.
 */
export function LibraryHero({
  applications,
  counts,
  values,
  showPlatforms,
  showReview,
}: {
  applications: App[];
  counts: LibraryCounts;
  values: { app: string; review: string; lite: string; kind: LibraryKind };
  showPlatforms: boolean;
  showReview: boolean;
}) {
  const { update, pending } = useLibraryUrl();
  // Lite (preview) versions exist for videos.
  const showLite = values.kind === "video" || values.kind === "all";

  return (
    <section
      className={cn("relative overflow-hidden rounded-2xl border bg-card shadow-xs transition-opacity", pending && "opacity-80")}
      aria-label="Quick filters"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_50%)]"
      />

      {/* Content tabs */}
      <div className="relative border-b border-border/70 px-1 sm:px-3">
        <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Content">
          {KINDS.map((k) => {
            const active = values.kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  update({ kind: k.value === "video" ? null : k.value, type: null, lite: k.value === "video" || k.value === "all" ? undefined : null })
                }
                className={cn(
                  "relative flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors sm:gap-2 sm:px-4",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`kind-${k.value}`}
              >
                <k.icon className="size-4" />
                {k.label}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                  {counts.kinds[k.value]}
                </span>
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-foreground" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative space-y-2 p-2.5 sm:space-y-4 sm:p-5">
        {showPlatforms && (
          <div className="space-y-1.5">
            <p className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">Platform</p>
            <div className={SCROLL_ROW}>
              <PlatformChip active={!values.app} onClick={() => update({ app: null })} count={counts.appsTotal} label="All platforms" />
              {applications.map((a) => (
                <PlatformChip
                  key={a.id}
                  active={values.app === a.id}
                  onClick={() => update({ app: values.app === a.id ? null : a.id })}
                  count={counts.apps[a.id] ?? 0}
                  label={a.name}
                  color={a.brandColor}
                />
              ))}
            </div>
          </div>
        )}
        {(showReview || showLite) && (
          // Phones: both groups side by side in one swipeable row.
          <div
            className={cn(
              "-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:gap-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden",
              showReview && showLite && "lg:grid-cols-2",
            )}
          >
            {showReview && (
              <Segmented label="Validation">
                {REVIEW.map((o) => (
                  <SegmentButton
                    key={o.key}
                    active={values.review === o.value}
                    onClick={() => update({ review: o.value || null, status: null })}
                    count={counts.review[o.key]}
                    testId={`review-${o.key}`}
                  >
                    {o.dot && <span className={cn("size-2 rounded-full", o.dot)} />}
                    {o.label}
                  </SegmentButton>
                ))}
              </Segmented>
            )}
            {showLite && (
              <Segmented label="Lite version">
                {LITE.map((o) => (
                  <SegmentButton
                    key={o.key}
                    active={values.lite === o.value}
                    onClick={() => update({ lite: o.value || null })}
                    count={counts.lite[o.key]}
                    testId={`lite-${o.key}`}
                  >
                    <o.icon className="size-3.5" />
                    {o.label}
                  </SegmentButton>
                ))}
              </Segmented>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PlatformChip({ active, onClick, count, label, color }: { active: boolean; onClick: () => void; count: number; label: string; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border bg-background/70 pl-1 pr-3 text-[13px] font-medium backdrop-blur transition-all hover:shadow-sm sm:h-10 sm:pl-1.5 sm:text-sm",
        active ? "border-transparent text-foreground shadow-sm ring-2" : "text-muted-foreground hover:text-foreground",
      )}
      style={
        active
          ? { backgroundColor: `color-mix(in oklab, ${color ?? "var(--primary)"} 14%, var(--background))`, ["--tw-ring-color" as string]: color ?? "var(--primary)" }
          : undefined
      }
      data-testid={`platform-${label}`}
    >
      {color ? (
        <span className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs" style={{ backgroundColor: color }}>
          {brandInitials(label)}
        </span>
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
          <Layers className="size-3.5" />
        </span>
      )}
      <span className="whitespace-nowrap">{label}</span>
      <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-background/80 text-foreground" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0 space-y-1.5 sm:min-w-0 sm:shrink">
      <p className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">{label}</p>
      <div
        className="flex gap-1 rounded-xl bg-muted/70 p-1 sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  count,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[13px] font-medium transition-all sm:flex-1 sm:px-3 sm:py-1.5 sm:text-sm",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
      )}
    >
      {children}
      <span className={cn("text-xs tabular-nums", active ? "text-muted-foreground" : "text-muted-foreground/70")}>{count}</span>
    </button>
  );
}
