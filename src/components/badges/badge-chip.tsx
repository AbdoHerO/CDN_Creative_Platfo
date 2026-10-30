import { cn } from "@/lib/utils";

export type BadgeChipData = { name: string; color: string; slug?: string };

/** Coloured label for a creative ("Motion graphique", "3D"…). `solid` is for use over thumbnails. */
export function BadgeChip({ badge, solid, className }: { badge: BadgeChipData; solid?: boolean; className?: string }) {
  if (solid) {
    return (
      <span
        className={cn("inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-xs", className)}
        style={{ backgroundColor: badge.color }}
      >
        {badge.name}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium", className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: badge.color }} />
      <span className="truncate">{badge.name}</span>
    </span>
  );
}

export function BadgeChips({ badges, solid, max, className }: { badges: BadgeChipData[]; solid?: boolean; max?: number; className?: string }) {
  if (badges.length === 0) return null;
  const shown = max ? badges.slice(0, max) : badges;
  const hidden = badges.length - shown.length;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {shown.map((b) => (
        <BadgeChip key={b.name} badge={b} solid={solid} />
      ))}
      {hidden > 0 && (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            solid ? "bg-black/65 text-white" : "border bg-card text-muted-foreground",
          )}
          title={badges.slice(shown.length).map((b) => b.name).join(", ")}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}
