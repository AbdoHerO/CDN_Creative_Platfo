import { safeObjectName } from "@/lib/files/naming";

/**
 * Object key layout in the bucket. Keys use immutable ids, so renaming a
 * creative, campaign or application never requires moving objects.
 *
 *   originals/<applicationId>/<creativeId>/<fileId>/<safe-filename>
 *   derived/<fileId>/thumbnail.webp
 *   derived/<fileId>/display.webp
 *   imports/<batchId>/<safe-filename>.zip
 *   branding/applications/<applicationId>/logo-<timestamp>.<ext>
 */

export function originalKey(applicationId: string, creativeId: string, fileId: string, filename: string) {
  return `originals/${applicationId}/${creativeId}/${fileId}/${safeObjectName(filename)}`;
}

export function thumbnailKey(fileId: string) {
  return `derived/${fileId}/thumbnail.webp`;
}

export function displayKey(fileId: string) {
  return `derived/${fileId}/display.webp`;
}

export function importArchiveKey(batchId: string, filename: string) {
  return `imports/${batchId}/${safeObjectName(filename)}`;
}

export function applicationLogoKey(applicationId: string, extension: string) {
  return `branding/applications/${applicationId}/logo-${Date.now()}.${extension}`;
}

export const KEY_PREFIXES = {
  originals: "originals/",
  derived: "derived/",
  imports: "imports/",
  branding: "branding/",
} as const;
