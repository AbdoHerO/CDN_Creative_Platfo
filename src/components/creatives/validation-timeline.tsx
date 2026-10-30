import { Archive, ArchiveRestore, Check, Eye, MessageSquareWarning, RotateCcw, Send, Undo2, X, FileWarning } from "lucide-react";
import type { CreativeStatus, ValidationAction } from "@/generated/prisma/enums";
import { STATUS_LABELS, VERSION_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VALIDATION_ACTION_LABELS } from "@/lib/workflow";

const ICON: Record<ValidationAction, { icon: typeof Check; tone: string }> = {
  SUBMITTED: { icon: Send, tone: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" },
  REVIEW_STARTED: { icon: Eye, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200" },
  APPROVED: { icon: Check, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" },
  DECLINED: { icon: X, tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" },
  CHANGES_REQUESTED: { icon: MessageSquareWarning, tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-200" },
  WITHDRAWN: { icon: Undo2, tone: "bg-muted text-muted-foreground" },
  REOPENED: { icon: RotateCcw, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200" },
  ARCHIVED: { icon: Archive, tone: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-300" },
  RESTORED: { icon: ArchiveRestore, tone: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-300" },
  RESET_NEW_VERSION: { icon: FileWarning, tone: "bg-muted text-muted-foreground" },
};

type Item = {
  id: string;
  action: ValidationAction;
  fromStatus: CreativeStatus;
  toStatus: CreativeStatus;
  comment: string | null;
  reason: string | null;
  fileId: string | null;
  reviewer: { name: string } | null;
  createdAt: string;
};

export function ValidationTimeline({ items, files }: { items: Item[]; files: { id: string; versionType: keyof typeof VERSION_TYPE_LABELS; versionNumber: number }[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">This creative has not been submitted for validation yet.</p>;
  }
  return (
    <ol className="relative space-y-0 rounded-xl border bg-card p-4">
      {items.map((v, i) => {
        const { icon: Icon, tone } = ICON[v.action];
        const file = v.fileId ? files.find((f) => f.id === v.fileId) : null;
        return (
          <li key={v.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-4 top-8 h-[calc(100%-2rem)] w-px bg-border" aria-hidden />}
            <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full", tone)}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm">
                <span className="font-medium">{VALIDATION_ACTION_LABELS[v.action]}</span>
                {v.reviewer && <span className="text-muted-foreground"> by {v.reviewer.name}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                <time title={formatDateTime(v.createdAt)}>{timeAgo(v.createdAt)}</time> · {STATUS_LABELS[v.fromStatus]} → {STATUS_LABELS[v.toStatus]}
                {file && ` · ${VERSION_TYPE_LABELS[file.versionType]} v${file.versionNumber}`}
              </p>
              {(v.reason || v.comment) && (
                <blockquote
                  className={cn(
                    "mt-2 rounded-lg border-l-2 bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap",
                    v.reason ? "border-rose-400" : "border-border",
                  )}
                >
                  {v.reason && <span className="mb-0.5 block text-xs font-medium text-rose-700 dark:text-rose-300">Reason</span>}
                  {v.reason ?? v.comment}
                </blockquote>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
