import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeChipData = { name: string; color: string; slug?: string };

/** Dark or white text, whichever reads better on the badge colour (#RRGGBB). */
function textOn(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "#fff";
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111827" : "#fff";
}

/** Tinted chip for page backgrounds: light wash of the colour, coloured text and outline (light and dark themes). */
function tinted(color: string): React.CSSProperties {
  return {
    backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
    color: `color-mix(in oklab, ${color} 70%, var(--foreground))`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 32%, transparent)`,
  };
}

/** Filled chip for use over thumbnails: the colour with a soft highlight, readable on any picture. */
function filled(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.18), transparent)",
    color: textOn(color),
    boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.22), 0 1px 3px rgb(0 0 0 / 0.35)",
  };
}

/**
 * Coloured label for a creative ("Motion graphique", "3D"…). `solid` is for use
 * over thumbnails; `onRemove` adds a × button (edit mode).
 */
export function BadgeChip({
  badge,
  solid,
  onRemove,
  disabled,
  className,
}: {
  badge: BadgeChipData;
  solid?: boolean;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1 rounded-full px-2 text-[11px] font-semibold leading-none tracking-tight",
        solid && "text-[10px]",
        onRemove && "pr-0.5",
        className,
      )}
      style={solid ? filled(badge.color) : tinted(badge.color)}
    >
      {!solid && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: badge.color }} />}
      <span className="truncate">{badge.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="flex size-4 shrink-0 items-center justify-center rounded-full bg-current/15 transition-colors hover:bg-current/30 disabled:opacity-50"
          aria-label={`Remove ${badge.name}`}
        >
          <X className="size-2.5" strokeWidth={3} />
        </button>
      )}
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
            "inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-semibold",
            solid ? "bg-black/55 text-white ring-1 ring-white/20 backdrop-blur" : "bg-muted text-muted-foreground",
          )}
          title={badges.slice(shown.length).map((b) => b.name).join(", ")}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}
