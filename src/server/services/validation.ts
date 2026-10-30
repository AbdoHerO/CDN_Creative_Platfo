import type { ActivityAction, CreativeStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notifyUsers, reviewerIdsFor } from "@/lib/notifications";
import {
  can,
  canArchiveCreative,
  canRestoreCreative,
  canReviewCreative,
  canSubmitCreative,
  canWithdrawCreative,
  type Actor,
  type CreativeRef,
} from "@/lib/permissions";
import type { RequestMeta } from "@/lib/request";
import { BULK_FROM, planTransition, VALIDATION_ACTION_LABELS, WorkflowError, type BulkAction, type WorkflowAction } from "@/lib/workflow";
import { lockCreative } from "./creatives";

/**
 * Apply a validation workflow action. Authorisation, the allowed transition,
 * the validation history, the audit log and notifications are all handled in
 * one transaction so the status can never change without a trace.
 */

const ACTIVITY_FOR: Record<WorkflowAction, ActivityAction> = {
  submit: "CREATIVE_STATUS_CHANGED",
  withdraw: "CREATIVE_STATUS_CHANGED",
  startReview: "CREATIVE_STATUS_CHANGED",
  approve: "CREATIVE_APPROVED",
  decline: "CREATIVE_DECLINED",
  requestChanges: "CREATIVE_STATUS_CHANGED",
  reopen: "CREATIVE_STATUS_CHANGED",
  archive: "CREATIVE_ARCHIVED",
  restore: "CREATIVE_RESTORED",
};

function authorize(actor: Actor, action: WorkflowAction, creative: CreativeRef): boolean {
  switch (action) {
    case "submit":
      return canSubmitCreative(actor, creative);
    case "withdraw":
      return canWithdrawCreative(actor, creative);
    case "archive":
      return canArchiveCreative(actor, creative);
    case "restore":
      return canRestoreCreative(actor, creative);
    default:
      return canReviewCreative(actor, creative);
  }
}

type Transitioned = Awaited<ReturnType<typeof transitionCreative>>;

/**
 * Bulk validation (Pending Validation page and library selection): submit or
 * approve many creatives at once. Approving a draft or declined creative submits
 * it first, so it goes straight to Approved with the full history. Creatives that
 * cannot take the action (wrong status, no full version, failed integrity check,
 * not allowed, deleted) are skipped; any other error stops the batch. People get
 * one summary notification instead of one per creative.
 */
export async function bulkTransition(actor: Actor & { name: string }, creativeIds: string[], action: BulkAction, meta?: RequestMeta | null) {
  if (action === "approve" && !can(actor.role, "creative.review")) throw new ForbiddenError("Only reviewers can approve creatives.");
  const ids = [...new Set(creativeIds)];
  const done: Transitioned[] = [];
  for (const creativeId of ids) {
    try {
      const current = await prisma.creative.findUnique({ where: { id: creativeId }, select: { status: true } });
      if (!current || !BULK_FROM[action].includes(current.status)) continue;
      if (action === "submit" || current.status === "DRAFT" || current.status === "DECLINED") {
        const submitted = await transitionCreative(actor, creativeId, "submit", { quiet: true }, meta);
        if (action === "submit") {
          done.push(submitted);
          continue;
        }
      }
      done.push(await transitionCreative(actor, creativeId, "approve", { quiet: true }, meta));
    } catch (err) {
      if (!(err instanceof AppError || err instanceof WorkflowError)) throw err;
    }
  }
  await notifyBulk(actor, action, done);
  return { done: done.length, skipped: ids.length - done.length };
}

/** One notification per person for a whole batch (the single-creative wording when there is only one). */
async function notifyBulk(actor: Actor & { name: string }, action: BulkAction, done: Transitioned[]) {
  const byUser = new Map<string, Transitioned[]>();
  const add = (userId: string | null, c: Transitioned) => {
    if (userId) byUser.set(userId, [...(byUser.get(userId) ?? []), c]);
  };
  if (action === "submit") {
    const reviewers = new Map<string, string[]>();
    for (const c of done) {
      if (!reviewers.has(c.applicationId)) reviewers.set(c.applicationId, await reviewerIdsFor(c.applicationId));
      for (const id of reviewers.get(c.applicationId)!) add(id, c);
    }
  } else {
    for (const c of done) add(c.createdById, c);
  }
  for (const [userId, list] of byUser) {
    const one = list.length === 1 ? list[0] : null;
    await notifyUsers(
      [userId],
      action === "submit"
        ? {
            type: "CREATIVE_SUBMITTED",
            title: one ? `New creative to validate: ${one.name}` : `${list.length} new creatives to validate`,
            body: one ? `${actor.name} submitted it for validation.` : `${actor.name} submitted ${list.length} creatives for validation.`,
            link: one ? `/creatives/${one.id}` : "/validation?tab=PENDING",
            creativeId: one?.id,
            actorId: actor.id,
          }
        : {
            type: "CREATIVE_APPROVED",
            title: one ? `Approved: ${one.name}` : `${list.length} of your creatives were approved`,
            body: one ? `${actor.name} approved your creative.` : `${actor.name} approved ${list.length} of your creatives.`,
            link: one ? `/creatives/${one.id}` : "/approved",
            creativeId: one?.id,
            actorId: actor.id,
          },
    );
  }
}

export async function transitionCreative(
  actor: Actor & { name: string },
  creativeId: string,
  action: WorkflowAction,
  /** quiet: no notifications (bulk actions send one summary instead). */
  input: { comment?: string | null; quiet?: boolean },
  meta?: RequestMeta | null,
) {
  const comment = input.comment?.trim() || null;
  const result = await prisma.$transaction(async (tx) => {
    await lockCreative(tx, creativeId);
    const creative = await tx.creative.findUnique({
      where: { id: creativeId },
      select: {
        id: true,
        name: true,
        status: true,
        applicationId: true,
        createdById: true,
        submittedAt: true,
        archivedFromStatus: true,
        files: { where: { versionType: "FULL", isCurrent: true }, select: { id: true, integrityStatus: true }, take: 1 },
      },
    });
    if (!creative) throw new NotFoundError("Creative not found.");
    if (!authorize(actor, action, creative)) throw new ForbiddenError("You are not allowed to perform this action.");

    const currentFull = creative.files[0] ?? null;
    if (action === "submit" && !currentFull) {
      throw new AppError("Upload the full version before submitting this creative for validation.", 409);
    }
    if (action === "approve" && currentFull?.integrityStatus === "MISMATCH") {
      throw new AppError("The current full version failed its integrity check. Upload it again before approving.", 409);
    }

    const steps = planTransition(action, creative.status, { archivedFromStatus: creative.archivedFromStatus, comment });
    const finalStatus: CreativeStatus = steps[steps.length - 1].to;
    const now = new Date();

    await tx.creative.update({
      where: { id: creative.id },
      data: {
        status: finalStatus,
        ...(action === "submit" ? { submittedAt: now, declinedAt: null } : {}),
        ...(action === "approve" ? { approvedAt: now, declinedAt: null } : {}),
        ...(action === "decline" ? { declinedAt: now, approvedAt: null } : {}),
        ...(action === "reopen" ? { approvedAt: null } : {}),
        ...(action === "archive" ? { archivedAt: now, archivedFromStatus: creative.status } : {}),
        ...(action === "restore" ? { archivedAt: null, archivedFromStatus: null } : {}),
      },
    });

    for (const [i, step] of steps.entries()) {
      const isLast = i === steps.length - 1;
      await tx.validation.create({
        data: {
          creativeId: creative.id,
          action: step.action,
          fromStatus: step.from,
          toStatus: step.to,
          reviewerId: actor.id,
          comment: isLast && action !== "decline" ? comment : null,
          reason: isLast && action === "decline" ? comment : null,
          fileId: currentFull?.id ?? null,
          createdAt: new Date(now.getTime() + i),
        },
      });
    }

    await logActivity(
      {
        actorId: actor.id,
        action: ACTIVITY_FOR[action],
        entityType: "CREATIVE",
        entityId: creative.id,
        creativeId: creative.id,
        applicationId: creative.applicationId,
        summary: `${actor.name}: ${VALIDATION_ACTION_LABELS[steps[steps.length - 1].action].toLowerCase()} — “${creative.name}” (${creative.status} → ${finalStatus})`,
        metadata: { from: creative.status, to: finalStatus, comment },
        meta,
      },
      tx,
    );

    const link = `/creatives/${creative.id}`;
    const owner = creative.createdById ? [creative.createdById] : [];
    switch (input.quiet ? null : action) {
      case "submit":
        await notifyUsers(
          await reviewerIdsFor(creative.applicationId, tx),
          { type: "CREATIVE_SUBMITTED", title: `New creative to validate: ${creative.name}`, body: comment ?? `${actor.name} submitted it for validation.`, link, creativeId: creative.id, actorId: actor.id },
          tx,
        );
        break;
      case "approve":
        await notifyUsers(owner, { type: "CREATIVE_APPROVED", title: `Approved: ${creative.name}`, body: comment ?? `${actor.name} approved your creative.`, link, creativeId: creative.id, actorId: actor.id }, tx);
        break;
      case "decline":
        await notifyUsers(owner, { type: "CREATIVE_DECLINED", title: `Declined: ${creative.name}`, body: `Reason: ${comment}`, link, creativeId: creative.id, actorId: actor.id }, tx);
        break;
      case "requestChanges":
        await notifyUsers(owner, { type: "CHANGES_REQUESTED", title: `Changes requested: ${creative.name}`, body: comment, link, creativeId: creative.id, actorId: actor.id }, tx);
        break;
      case "reopen":
        await notifyUsers(owner, { type: "SYSTEM", title: `Review reopened: ${creative.name}`, body: comment, link, creativeId: creative.id, actorId: actor.id }, tx);
        break;
    }
    return { id: creative.id, status: finalStatus, name: creative.name, applicationId: creative.applicationId, createdById: creative.createdById };
  });
  return result;
}
