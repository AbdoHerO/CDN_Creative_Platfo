import type { CreativeStatus, RoleKey } from "@/generated/prisma/enums";

/**
 * Role-based permission matrix. Every server action and route handler checks
 * these rules — hiding UI is only a convenience, never the enforcement.
 */

export const PERMISSIONS = [
  "creative.view",
  "creative.upload",
  "creative.editAny",
  "creative.review",
  "creative.archive",
  "creative.deleteAny",
  "campaign.manage",
  "application.manage",
  "user.manage",
  "settings.manage",
  "activity.view",
  "storage.view",
  "storage.manage",
  "import.create",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<RoleKey, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: [
    "creative.view",
    "creative.upload",
    "creative.editAny",
    "creative.review",
    "creative.archive",
    "campaign.manage",
    "activity.view",
    "storage.view",
    "import.create",
  ],
  CREATOR: ["creative.view", "creative.upload", "import.create"],
  VIEWER: ["creative.view"],
};

export function can(role: RoleKey, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: RoleKey): Permission[] {
  return [...MATRIX[role]];
}

/** Minimal shape needed for resource-level checks. */
export type Actor = {
  id: string;
  role: RoleKey;
  restrictApplications: boolean;
  applicationIds: string[];
};

export type CreativeRef = {
  applicationId: string;
  createdById: string | null;
  status: CreativeStatus;
  submittedAt?: Date | null;
};

export function hasApplicationAccess(actor: Actor, applicationId: string): boolean {
  return !actor.restrictApplications || actor.applicationIds.includes(applicationId);
}

/** Mirrors `creativeVisibilityWhere` for a single, already-loaded creative. */
export function canViewCreative(actor: Actor, creative: CreativeRef): boolean {
  if (!hasApplicationAccess(actor, creative.applicationId)) return false;
  switch (actor.role) {
    case "ADMIN":
    case "MANAGER":
      return true;
    case "CREATOR":
      return creative.status !== "DRAFT" || creative.createdById === actor.id;
    case "VIEWER":
      return creative.status === "APPROVED";
  }
}

const CREATOR_EDITABLE: CreativeStatus[] = ["DRAFT", "DECLINED"];

/** Edit metadata or upload a new version. */
export function canEditCreative(actor: Actor, creative: CreativeRef): boolean {
  if (!canViewCreative(actor, creative)) return false;
  if (can(actor.role, "creative.editAny")) return creative.status !== "ARCHIVED";
  return (
    can(actor.role, "creative.upload") &&
    creative.createdById === actor.id &&
    CREATOR_EDITABLE.includes(creative.status)
  );
}

export function canSubmitCreative(actor: Actor, creative: CreativeRef): boolean {
  if (!canViewCreative(actor, creative)) return false;
  if (!["DRAFT", "DECLINED"].includes(creative.status)) return false;
  return can(actor.role, "creative.editAny") || (can(actor.role, "creative.upload") && creative.createdById === actor.id);
}

export function canWithdrawCreative(actor: Actor, creative: CreativeRef): boolean {
  if (!canViewCreative(actor, creative) || creative.status !== "PENDING") return false;
  return can(actor.role, "creative.review") || creative.createdById === actor.id;
}

export function canReviewCreative(actor: Actor, creative: CreativeRef): boolean {
  return canViewCreative(actor, creative) && can(actor.role, "creative.review");
}

export function canArchiveCreative(actor: Actor, creative: CreativeRef): boolean {
  if (!canViewCreative(actor, creative) || creative.status === "ARCHIVED") return false;
  if (can(actor.role, "creative.archive")) return true;
  return creative.createdById === actor.id && CREATOR_EDITABLE.includes(creative.status) && can(actor.role, "creative.upload");
}

export function canRestoreCreative(actor: Actor, creative: CreativeRef): boolean {
  return canViewCreative(actor, creative) && creative.status === "ARCHIVED" && can(actor.role, "creative.archive");
}

/** Admins may delete anything; owners may delete their own never-submitted drafts. */
export function canDeleteCreative(actor: Actor, creative: CreativeRef): boolean {
  if (!canViewCreative(actor, creative)) return false;
  if (can(actor.role, "creative.deleteAny")) return true;
  return creative.createdById === actor.id && creative.status === "DRAFT" && !creative.submittedAt;
}
