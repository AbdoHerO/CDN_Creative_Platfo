import type { VersionType } from "@/generated/prisma/enums";

/**
 * Filename conventions for full / preview versions.
 *
 *   summer_campaign.mp4          → FULL,    matchKey "summer_campaign"
 *   summer_campaign_preview.mp4  → PREVIEW, matchKey "summer_campaign"
 *
 * The match key only *suggests* an association. The actual link is the
 * Creative ↔ CreativeFile relation in the database, and ambiguous matches are
 * always resolved by the user.
 */

const PREVIEW_SUFFIX = /_preview$/i;

export type ParsedFilename = {
  /** Filename without any directory components. */
  filename: string;
  /** Lower-cased extension without dot ("" when absent). */
  extension: string;
  /** Name without extension. */
  stem: string;
  /** Stem with the `_preview` suffix removed. */
  baseStem: string;
  isPreview: boolean;
  detectedVersionType: VersionType;
  matchKey: string;
  /** Human friendly default creative name. */
  displayName: string;
};

export function stripDirectories(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function normalizeMatchKey(value: string): string {
  const key = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || "untitled";
}

export function humanizeStem(stem: string): string {
  const cleaned = stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled creative";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function parseFilename(input: string): ParsedFilename {
  const filename = stripDirectories(input.trim());
  const dot = filename.lastIndexOf(".");
  const hasExt = dot > 0 && dot < filename.length - 1;
  const extension = hasExt ? filename.slice(dot + 1).toLowerCase() : "";
  const stem = hasExt ? filename.slice(0, dot) : filename;
  const isPreview = PREVIEW_SUFFIX.test(stem) && stem.length > "_preview".length;
  const baseStem = isPreview ? stem.replace(PREVIEW_SUFFIX, "") : stem;
  return {
    filename,
    extension,
    stem,
    baseStem,
    isPreview,
    detectedVersionType: isPreview ? "PREVIEW" : "FULL",
    matchKey: normalizeMatchKey(baseStem),
    displayName: humanizeStem(baseStem),
  };
}

/** Make a filename safe for use inside an object key (keeps the extension). */
export function safeObjectName(filename: string): string {
  const parsed = parseFilename(filename);
  const stem = parsed.stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  const ext = parsed.extension.replace(/[^a-z0-9]/g, "").slice(0, 10);
  return `${stem || "file"}${ext ? `.${ext}` : ""}`;
}

/** RFC 6266 / 5987 Content-Disposition header value preserving the original name. */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const name = stripDirectories(filename);
  const fallback = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
