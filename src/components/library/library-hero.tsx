"use client";

import { Layers, Sparkles, VideoOff } from "lucide-react";
import { brandInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LibraryCounts } from "@/server/queries/library";
import { useLibraryUrl } from "./use-library-url";

type App = { id: string; name: string; brandColor: string };

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

/**
 * Library banner: one-click filters by platform, validation state and lite
 * (preview) version, each with live counts.
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
  values: { app: string; review: string; lite: string };
  showPlatforms: boolean;
  showReview: boolean;
}) {
  const { update, pending } = useLibraryUrl();

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card shadow-xs transition-opacity",
        pending && "opacity-80",
      )}
      aria-label="Quick filters"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_50%)]"
      />
      <div className="relative space-y-4 p-4 sm:p-5">
        {showPlatforms && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Platform</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
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
        <div className={cn("grid gap-3", showReview && "lg:grid-cols-2")}>
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
        </div>
      </div>
    </section>
  );
}

function PlatformChip({ active, onClick, count, label, color }: { active: boolean; onClick: () => void; count: number; label: string; color?: string }) {
  const initials = brandInitials(label);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex h-10 shrink-0 items-center gap-2 rounded-full border bg-background/70 pl-1.5 pr-3 text-sm font-medium backdrop-blur transition-all hover:-translate-y-px hover:shadow-sm",
        active ? "border-transparent text-foreground shadow-sm ring-2" : "text-muted-foreground hover:text-foreground",
      )}
      style={active ? { backgroundColor: `color-mix(in oklab, ${color ?? "var(--primary)"} 14%, var(--background))`, ["--tw-ring-color" as string]: color ?? "var(--primary)" } : undefined}
      data-testid={`platform-${label}`}
    >
      {color ? (
        <span className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs" style={{ backgroundColor: color }}>
          {initials}
        </span>
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
          <Layers className="size-3.5" />
        </span>
      )}
      {label}
      <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-background/80 text-foreground" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function Segmented({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1" role="group" aria-label={label}>
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
        "flex flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
      )}
    >
      {children}
      <span className={cn("text-xs tabular-nums", active ? "text-muted-foreground" : "text-muted-foreground/70")}>{count}</span>
    </button>
  );
}
