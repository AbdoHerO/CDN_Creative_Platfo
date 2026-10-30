import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CreativeStatus } from "@/generated/prisma/enums";

export const STATUS_STYLES: Record<CreativeStatus, { badge: string; dot: string }> = {
  DRAFT: { badge: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground/60" },
  PENDING: {
    badge: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25",
    dot: "bg-amber-500",
  },
  IN_REVIEW: {
    badge: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/25",
    dot: "bg-sky-500",
  },
  APPROVED: {
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/25",
    dot: "bg-emerald-500",
  },
  DECLINED: {
    badge: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/25",
    dot: "bg-rose-500",
  },
  ARCHIVED: { badge: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-300 dark:ring-zinc-500/25", dot: "bg-zinc-400" },
};

export function StatusBadge({ status, className }: { status: CreativeStatus; className?: string }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        style.badge,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
