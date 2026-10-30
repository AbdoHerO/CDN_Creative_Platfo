"use client";

import { Archive, ArchiveRestore, Check, Eye, MessageSquareWarning, RotateCcw, Send, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { WORKFLOW, WORKFLOW_ACTION_LABELS, type WorkflowAction } from "@/lib/workflow";
import { transitionCreativeAction } from "@/server/actions/creatives";

const ICONS: Record<WorkflowAction, typeof Check> = {
  submit: Send,
  withdraw: Undo2,
  startReview: Eye,
  approve: Check,
  decline: X,
  requestChanges: MessageSquareWarning,
  reopen: RotateCcw,
  archive: Archive,
  restore: ArchiveRestore,
};

const PRIMARY: WorkflowAction[] = ["submit", "approve"];
const DIALOG_COPY: Partial<Record<WorkflowAction, { title: string; description: string; label: string; placeholder: string }>> = {
  submit: {
    title: "Submit for validation",
    description: "Reviewers will be notified. You can add a note for them.",
    label: "Note for reviewers (optional)",
    placeholder: "Anything reviewers should know…",
  },
  approve: {
    title: "Approve creative",
    description: "The current full version becomes the approved version. The creator is notified.",
    label: "Comment (optional)",
    placeholder: "e.g. Approved for Instagram and Facebook",
  },
  decline: {
    title: "Decline creative",
    description: "Explain why so the creator can correct and resubmit it.",
    label: "Reason for declining (required)",
    placeholder: "e.g. Logo is outdated; legal mention missing at the end",
  },
  requestChanges: {
    title: "Request changes",
    description: "The creative goes back to draft and the creator is notified with your comment.",
    label: "Requested changes (required)",
    placeholder: "Describe what needs to change",
  },
  reopen: {
    title: "Reopen review",
    description: "Moves the approved creative back into review.",
    label: "Reason (required)",
    placeholder: "Why does this need another review?",
  },
  archive: {
    title: "Archive creative",
    description: "Archived creatives are hidden from the library but kept, and can be restored.",
    label: "Comment (optional)",
    placeholder: "",
  },
};

export function WorkflowActions({
  creativeId,
  actions,
  size = "default",
  include,
}: {
  creativeId: string;
  actions: WorkflowAction[];
  size?: "default" | "sm";
  include?: WorkflowAction[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<WorkflowAction | null>(null);
  const [comment, setComment] = useState("");
  const shown = actions.filter((a) => (include ? include.includes(a) : a !== "archive" && a !== "restore"));

  const run = (action: WorkflowAction, text?: string) =>
    startTransition(async () => {
      const res = await transitionCreativeAction(creativeId, { action, comment: text ?? null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Status updated.");
      setDialog(null);
      setComment("");
      router.refresh();
    });

  const onClick = (action: WorkflowAction) => {
    if (DIALOG_COPY[action]) {
      setComment("");
      setDialog(action);
    } else {
      run(action);
    }
  };

  const rule = dialog ? WORKFLOW[dialog] : null;
  const copy = dialog ? DIALOG_COPY[dialog] : null;
  const commentRequired = rule?.comment === "required" || rule?.comment === "reason";

  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((action) => {
        const Icon = ICONS[action];
        return (
          <Button
            key={action}
            size={size}
            variant={PRIMARY.includes(action) ? "default" : action === "decline" ? "destructive" : "outline"}
            onClick={() => onClick(action)}
            disabled={pending}
            data-testid={`workflow-${action}`}
          >
            {pending && !dialog ? <Spinner /> : <Icon />}
            {WORKFLOW_ACTION_LABELS[action]}
          </Button>
        );
      })}
      <Dialog open={dialog !== null} onOpenChange={(v) => !v && !pending && setDialog(null)}>
        <DialogContent>
          {copy && dialog && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (commentRequired && comment.trim().length < 3) return;
                run(dialog, comment);
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
              </DialogHeader>
              <Field data-invalid={commentRequired && comment.length > 0 && comment.trim().length < 3}>
                <FieldLabel htmlFor="workflow-comment">{copy.label}</FieldLabel>
                <Textarea
                  id="workflow-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={copy.placeholder}
                  rows={4}
                  autoFocus
                  maxLength={5000}
                  required={commentRequired}
                />
                {commentRequired && <FieldDescription>At least a few words are required.</FieldDescription>}
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={dialog === "decline" ? "destructive" : "default"}
                  disabled={pending || (commentRequired && comment.trim().length < 3)}
                  data-testid="workflow-confirm"
                >
                  {pending && <Spinner />}
                  {WORKFLOW_ACTION_LABELS[dialog]}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
