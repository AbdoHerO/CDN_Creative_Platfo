import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single ratio against a limit. The unfilled track is a lighter step of the
 * fill's hue; crossing the warning threshold switches the fill to the warning
 * colour and always adds an icon + label (never colour alone).
 */
export function Meter({ value, max, label, warnAt = 0.8 }: { value: number; max: number; label: string; warnAt?: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const warn = ratio >= warnAt;
  return (
    <div className="space-y-1.5">
      <div
        className={cn("h-2 w-full overflow-hidden rounded-full", warn ? "bg-amber-500/20" : "bg-primary/15")}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", warn ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.max(ratio * 100, value > 0 ? 1 : 0)}%` }} />
      </div>
      {warn && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5" /> Approaching the storage threshold set in Settings
        </p>
      )}
    </div>
  );
}
