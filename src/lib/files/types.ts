import type { MediaType } from "@/generated/prisma/enums";

/**
 * Allowed upload formats. The extension decides the canonical MIME type stored on
 * the stored object; the actual bytes are then sniffed (magic numbers) server-side and
 * must agree with the declared media family before a file is accepted.
 */

export type FileTypeDef = {
  extensions: string[];
  mime: string;
  mediaType: MediaType;
  /** Can a browser render the original directly (video/img/iframe)? */
  browserPreviewable: boolean;
  /** MIME types that `file-type` may report for this format. */
  sniffMimes: string[];
  /** Text formats that cannot be detected by magic number. */
  textual?: boolean;
};

export const FILE_TYPES: FileTypeDef[] = [
  { extensions: ["mp4"], mime: "video/mp4", mediaType: "VIDEO", browserPreviewable: true, sniffMimes: ["video/mp4", "video/x-m4v", "video/quicktime", "audio/mp4", "audio/x-m4a"] },
  { extensions: ["m4v"], mime: "video/x-m4v", mediaType: "VIDEO", browserPreviewable: true, sniffMimes: ["video/x-m4v", "video/mp4", "video/quicktime"] },
  { extensions: ["mov"], mime: "video/quicktime", mediaType: "VIDEO", browserPreviewable: true, sniffMimes: ["video/quicktime", "video/mp4"] },
  { extensions: ["webm"], mime: "video/webm", mediaType: "VIDEO", browserPreviewable: true, sniffMimes: ["video/webm", "audio/webm"] },
  { extensions: ["mkv"], mime: "video/x-matroska", mediaType: "VIDEO", browserPreviewable: false, sniffMimes: ["video/x-matroska", "video/webm"] },
  { extensions: ["avi"], mime: "video/x-msvideo", mediaType: "VIDEO", browserPreviewable: false, sniffMimes: ["video/vnd.avi", "video/x-msvideo"] },

  { extensions: ["jpg", "jpeg"], mime: "image/jpeg", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/jpeg"] },
  { extensions: ["png"], mime: "image/png", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/png", "image/apng"] },
  { extensions: ["gif"], mime: "image/gif", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/gif"] },
  { extensions: ["webp"], mime: "image/webp", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/webp"] },
  { extensions: ["avif"], mime: "image/avif", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/avif", "image/heif"] },
  { extensions: ["svg"], mime: "image/svg+xml", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/svg+xml", "application/xml"], textual: true },
  { extensions: ["tif", "tiff"], mime: "image/tiff", mediaType: "IMAGE", browserPreviewable: false, sniffMimes: ["image/tiff"] },
  { extensions: ["bmp"], mime: "image/bmp", mediaType: "IMAGE", browserPreviewable: true, sniffMimes: ["image/bmp"] },
  { extensions: ["heic", "heif"], mime: "image/heic", mediaType: "IMAGE", browserPreviewable: false, sniffMimes: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"] },
  { extensions: ["psd"], mime: "image/vnd.adobe.photoshop", mediaType: "IMAGE", browserPreviewable: false, sniffMimes: ["image/vnd.adobe.photoshop"] },

  { extensions: ["pdf"], mime: "application/pdf", mediaType: "DOCUMENT", browserPreviewable: true, sniffMimes: ["application/pdf"] },
  { extensions: ["ai"], mime: "application/postscript", mediaType: "DOCUMENT", browserPreviewable: false, sniffMimes: ["application/pdf", "application/postscript", "application/illustrator", "application/eps"] },
  { extensions: ["eps"], mime: "application/postscript", mediaType: "DOCUMENT", browserPreviewable: false, sniffMimes: ["application/postscript", "application/eps"] },

  { extensions: ["mp3"], mime: "audio/mpeg", mediaType: "AUDIO", browserPreviewable: true, sniffMimes: ["audio/mpeg"] },
  { extensions: ["wav"], mime: "audio/wav", mediaType: "AUDIO", browserPreviewable: true, sniffMimes: ["audio/wav", "audio/vnd.wave", "audio/x-wav"] },
  { extensions: ["m4a"], mime: "audio/mp4", mediaType: "AUDIO", browserPreviewable: true, sniffMimes: ["audio/x-m4a", "audio/mp4", "video/mp4"] },
  { extensions: ["aac"], mime: "audio/aac", mediaType: "AUDIO", browserPreviewable: true, sniffMimes: ["audio/aac"] },
  { extensions: ["ogg"], mime: "audio/ogg", mediaType: "AUDIO", browserPreviewable: true, sniffMimes: ["audio/ogg", "audio/opus", "video/ogg"] },
];

export const ZIP_TYPE: FileTypeDef = {
  extensions: ["zip"],
  mime: "application/zip",
  mediaType: "OTHER",
  browserPreviewable: false,
  sniffMimes: ["application/zip"],
};

const BY_EXTENSION = new Map<string, FileTypeDef>();
for (const def of FILE_TYPES) for (const ext of def.extensions) BY_EXTENSION.set(ext, def);

export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function fileTypeForName(filename: string): FileTypeDef | null {
  return BY_EXTENSION.get(extensionOf(filename)) ?? null;
}

export const ACCEPTED_EXTENSIONS = FILE_TYPES.flatMap((t) => t.extensions);

/** `accept` attribute for <input type="file">. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

/**
 * Validate sniffed bytes against the declared type. `detectedMime` comes from the
 * `file-type` package; textual formats are checked by inspecting the head bytes.
 */
export function sniffMatches(def: FileTypeDef, detectedMime: string | undefined, head: Uint8Array): boolean {
  if (def.textual) {
    if (detectedMime && !def.sniffMimes.includes(detectedMime)) return false;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(head.slice(0, 4096)).replace(/^﻿/, "").trimStart();
    return /^(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(text);
  }
  if (!detectedMime) return false;
  return def.sniffMimes.includes(detectedMime);
}

export function defaultCategoryFor(mediaType: MediaType) {
  switch (mediaType) {
    case "VIDEO":
      return "MARKETING_VIDEO" as const;
    case "IMAGE":
      return "PROMOTIONAL_IMAGE" as const;
    case "DOCUMENT":
      return "DOCUMENT" as const;
    default:
      return "OTHER" as const;
  }
}
