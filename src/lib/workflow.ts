import type { CreativeStatus, ValidationAction } from "@/generated/prisma/enums";

/**
 * Validation workflow state machine (pure, shared by server and tests).
 *
 *   DRAFT → PENDING → IN_REVIEW → APPROVED
 *                              ↘ DECLINED → (corrected) → PENDING
 *
 * Approving/declining straight from PENDING is allowed for convenience, but the
 * history always records an explicit REVIEW_STARTED step first so the canonical
 * path DRAFT → PENDING → IN_REVIEW → APPROVED/DECLINED is preserved.
 */

export type WorkflowAction =
  | "submit"
  | "withdraw"
  | "startReview"
  | "approve"
  | "decline"
  | "requestChanges"
  | "reopen"
  | "archive"
  | "restore";

type Rule = {
  from: CreativeStatus[];
  to: CreativeStatus | "RESTORE";
  record: ValidationAction;
  /** Comment requirement for this transition. */
  comment: "optional" | "required" | "reason";
};

export const WORKFLOW: Record<WorkflowAction, Rule> = {
  submit: { from: ["DRAFT", "DECLINED"], to: "PENDING", record: "SUBMITTED", comment: "optional" },
  withdraw: { from: ["PENDING"], to: "DRAFT", record: "WITHDRAWN", comment: "optional" },
  startReview: { from: ["PENDING"], to: "IN_REVIEW", record: "REVIEW_STARTED", comment: "optional" },
  approve: { from: ["PENDING", "IN_REVIEW"], to: "APPROVED", record: "APPROVED", comment: "optional" },
  decline: { from: ["PENDING", "IN_REVIEW"], to: "DECLINED", record: "DECLINED", comment: "reason" },
  requestChanges: {
    from: ["PENDING", "IN_REVIEW"],
    to: "DRAFT",
    record: "CHANGES_REQUESTED",
    comment: "required",
  },
  reopen: { from: ["APPROVED"], to: "IN_REVIEW", record: "REOPENED", comment: "required" },
  archive: {
    from: ["DRAFT", "PENDING", "IN_REVIEW", "APPROVED", "DECLINED"],
    to: "ARCHIVED",
    record: "ARCHIVED",
    comment: "optional",
  },
  restore: { from: ["ARCHIVED"], to: "RESTORE", record: "RESTORED", comment: "optional" },
};

export const WORKFLOW_ACTION_LABELS: Record<WorkflowAction, string> = {
  submit: "Submit for validation",
  withdraw: "Withdraw submission",
  startReview: "Start review",
  approve: "Approve",
  decline: "Decline",
  requestChanges: "Request changes",
  reopen: "Reopen review",
  archive: "Archive",
  restore: "Restore",
};

export const VALIDATION_ACTION_LABELS: Record<ValidationAction, string> = {
  SUBMITTED: "Submitted for validation",
  REVIEW_STARTED: "Review started",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CHANGES_REQUESTED: "Changes requested",
  WITHDRAWN: "Submission withdrawn",
  REOPENED: "Review reopened",
  ARCHIVED: "Archived",
  RESTORED: "Restored",
  RESET_NEW_VERSION: "Returned to draft (new full version)",
};

export type TransitionStep = { action: ValidationAction; from: CreativeStatus; to: CreativeStatus };

export class WorkflowError extends Error {}

/**
 * Resolve the status steps a workflow action produces from the current status.
 * Throws WorkflowError when the transition is not allowed.
 */
export function planTransition(
  action: WorkflowAction,
  current: CreativeStatus,
  opts: { archivedFromStatus?: CreativeStatus | null; comment?: string | null } = {},
): TransitionStep[] {
  const rule = WORKFLOW[action];
  if (!rule.from.includes(current)) {
    throw new WorkflowError(`Cannot ${WORKFLOW_ACTION_LABELS[action].toLowerCase()} a creative that is ${current.toLowerCase().replace("_", " ")}.`);
  }
  const comment = opts.comment?.trim() ?? "";
  if (rule.comment === "reason" && comment.length < 3) {
    throw new WorkflowError("A reason is required when declining a creative.");
  }
  if (rule.comment === "required" && comment.length < 3) {
    throw new WorkflowError("A comment is required for this action.");
  }

  const to: CreativeStatus =
    rule.to === "RESTORE" ? restoreTarget(opts.archivedFromStatus ?? null) : rule.to;

  const steps: TransitionStep[] = [];
  if ((action === "approve" || action === "decline") && current === "PENDING") {
    steps.push({ action: "REVIEW_STARTED", from: "PENDING", to: "IN_REVIEW" });
    steps.push({ action: rule.record, from: "IN_REVIEW", to });
  } else {
    steps.push({ action: rule.record, from: current, to });
  }
  return steps;
}

function restoreTarget(archivedFrom: CreativeStatus | null): CreativeStatus {
  if (!archivedFrom || archivedFrom === "ARCHIVED") return "DRAFT";
  // A creative archived mid-review goes back to the queue rather than straight into review.
  if (archivedFrom === "IN_REVIEW") return "PENDING";
  return archivedFrom;
}

export function availableActions(current: CreativeStatus): WorkflowAction[] {
  return (Object.keys(WORKFLOW) as WorkflowAction[]).filter((a) => WORKFLOW[a].from.includes(current));
}
