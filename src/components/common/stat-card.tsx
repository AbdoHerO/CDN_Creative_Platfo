import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "amber" | "sky" | "emerald" | "rose" | "zinc";
}) {
  const tones: Record<string, string> = {
    default: "text-primary bg-primary/10",
    amber: "text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-500/15",
    sky: "text-sky-700 bg-sky-100 dark:text-sky-200 dark:bg-sky-500/15",
    emerald: "text-emerald-700 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-500/15",
    rose: "text-rose-700 bg-rose-100 dark:text-rose-200 dark:bg-rose-500/15",
    zinc: "text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-500/15",
  };
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors max-sm:gap-1.5 max-sm:rounded-2xl max-sm:p-3 active:scale-[0.99]",
        href && "hover:border-foreground/15 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground max-sm:text-xs">{label}</span>
        {Icon && (
          <span className={cn("flex size-7 items-center justify-center rounded-md", tones[tone])}>
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <span className="tabular text-2xl font-semibold tracking-tight">{typeof value === "number" ? formatNumber(value) : value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}
