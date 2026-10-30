import { AlertTriangle, Bell, CheckCircle2, FileArchive, MessageSquareWarning, Send, ShieldAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/generated/prisma/enums";

const MAP: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  CREATIVE_SUBMITTED: { icon: Send, className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" },
  CREATIVE_APPROVED: { icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" },
  CREATIVE_DECLINED: { icon: XCircle, className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  CHANGES_REQUESTED: { icon: MessageSquareWarning, className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200" },
  PROCESSING_FAILED: { icon: AlertTriangle, className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  INTEGRITY_FAILED: { icon: ShieldAlert, className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  IMPORT_READY: { icon: FileArchive, className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200" },
  IMPORT_COMPLETED: { icon: FileArchive, className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" },
  IMPORT_FAILED: { icon: FileArchive, className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  SYSTEM: { icon: Bell, className: "bg-muted text-muted-foreground" },
};

export function NotificationIcon({ type, className }: { type: NotificationType; className?: string }) {
  const { icon: Icon, className: tone } = MAP[type];
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", tone, className)}>
      <Icon className="size-4" />
    </span>
  );
}
