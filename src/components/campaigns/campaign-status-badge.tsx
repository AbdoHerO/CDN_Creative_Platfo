import type { CampaignStatus } from "@/generated/prisma/enums";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<CampaignStatus, string> = {
  PLANNED: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-500/25",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/25",
  PAUSED: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25",
  COMPLETED: "bg-muted text-muted-foreground ring-border",
  ARCHIVED: "bg-muted text-muted-foreground ring-border",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ring-1 ring-inset", STATUS_TONE[status])}>
      {CAMPAIGN_STATUS_LABELS[status]}
    </span>
  );
}
