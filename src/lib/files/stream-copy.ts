import type { MediaType } from "@/generated/prisma/enums";
import { fileTypeForName } from "./types";

/**
 * Which videos get a streaming copy (720p H.264 with its index first, made by the
 * worker): those too heavy to stream smoothly on mobile data, and formats
 * browsers cannot play at all (MKV, AVI…). The original is never changed and is
 * still what downloads return.
 */
export function wantsStreamCopy(file: { mediaType: MediaType; extension: string; bitrate: number | null }, minMbps: number): boolean {
  if (file.mediaType !== "VIDEO") return false;
  if (!fileTypeForName(`x.${file.extension}`)?.browserPreviewable) return true;
  return file.bitrate != null && file.bitrate > minMbps * 1_000_000;
}
