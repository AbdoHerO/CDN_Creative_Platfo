import type { ActivityAction, CreativeStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { notifyUsers, reviewerIdsFor } from "@/lib/notifications";
import {
  canArchiveCreative,
  canRestoreCreative,
  canReviewCreative,
  canSubmitCreative,
  canWithdrawCreative,
  type Actor,
  type CreativeRef,
} from "@/lib/permissions";
import type { RequestMeta } from "@/lib/request";
import { planTransition, VALIDATION_ACTION_LABELS, WorkflowError, type WorkflowAction } from "@/lib/workflow";
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

/**
 * Library edit mode: submit several creatives for validation at once. Those that
 * cannot be submitted (wrong status, no full version, not allowed, deleted) are
 * skipped; any other error stops the batch.
 */
export async function submitCreatives(actor: Actor & { name: string }, creativeIds: string[], meta?: RequestMeta | null) {
  const ids = [...new Set(creativeIds)];
  let submitted = 0;
  for (const creativeId of ids) {
    try {
      await transitionCreative(actor, creativeId, "submit", {}, meta);
      submitted++;
    } catch (err) {
      if (!(err instanceof AppError || err instanceof WorkflowError)) throw err;
    }
  }
  return { submitted, skipped: ids.length - submitted };
}

export async function transitionCreative(
  actor: Actor & { name: string },
  creativeId: string,
  action: WorkflowAction,
  input: { comment?: string | null },
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
    switch (action) {
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
    return { status: finalStatus, name: creative.name };
  });
  return result;
}
