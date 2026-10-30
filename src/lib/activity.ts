import type { ActivityAction, EntityType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, type Db } from "@/lib/db";
import type { RequestMeta } from "@/lib/request";

export type ActivityInput = {
  actorId: string | null;
  action: ActivityAction;
  entityType: EntityType;
  entityId?: string | null;
  creativeId?: string | null;
  applicationId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  meta?: RequestMeta | null;
};

/** Append an entry to the audit log (inside the caller's transaction when given). */
export async function logActivity(input: ActivityInput, db: Db = prisma) {
  await db.activityLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      creativeId: input.creativeId ?? null,
      applicationId: input.applicationId ?? null,
      summary: input.summary.slice(0, 1000),
      metadata: input.metadata,
      ipAddress: input.meta?.ipAddress ?? null,
      userAgent: input.meta?.userAgent ?? null,
    },
  });
}

export const ACTIVITY_LABELS: Record<ActivityAction, string> = {
  AUTH_LOGIN: "Signed in",
  AUTH_LOGOUT: "Signed out",
  AUTH_LOGIN_FAILED: "Failed sign-in",
  PASSWORD_CHANGED: "Password changed",
  CREATIVE_CREATED: "Creative created",
  CREATIVE_UPDATED: "Metadata updated",
  CREATIVE_DELETED: "Creative deleted",
  CREATIVE_STATUS_CHANGED: "Status changed",
  CREATIVE_APPROVED: "Approved",
  CREATIVE_DECLINED: "Declined",
  CREATIVE_ARCHIVED: "Archived",
  CREATIVE_RESTORED: "Restored",
  FILE_UPLOADED: "File uploaded",
  VERSION_UPLOADED: "Version uploaded",
  FILE_DELETED: "File deleted",
  FILE_MOVED: "File moved",
  FILE_SET_CURRENT: "Current version changed",
  FILE_REPLACED: "File replaced",
  FILE_DOWNLOADED: "Downloaded",
  FILE_INTEGRITY_FAILED: "Integrity check failed",
  APPLICATION_CREATED: "Application created",
  APPLICATION_UPDATED: "Application updated",
  APPLICATION_STATUS_CHANGED: "Application status changed",
  CAMPAIGN_CREATED: "Campaign created",
  CAMPAIGN_UPDATED: "Campaign updated",
  CAMPAIGN_DELETED: "Campaign deleted",
  USER_CREATED: "User created",
  USER_UPDATED: "User updated",
  USER_ROLE_CHANGED: "Role changed",
  USER_DISABLED: "User disabled",
  USER_ENABLED: "User enabled",
  USER_PASSWORD_RESET: "Password reset",
  IMPORT_STARTED: "ZIP import started",
  IMPORT_COMPLETED: "ZIP import completed",
  IMPORT_FAILED: "ZIP import failed",
  SETTINGS_UPDATED: "Settings updated",
  STORAGE_RECONCILED: "Storage reconciled",
};
