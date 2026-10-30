import type { CreativeCategory } from "@/generated/prisma/enums";
import { normalizeMatchKey } from "./naming";

/**
 * Media folders of the import template (`<platform>/banners/…`, `<platform>/videos/…`,
 * `<platform>/pdf/…`). The folder just above one of them names the platform;
 * banners and pdf folders also set the category.
 */
const MEDIA_FOLDERS = new Map<string, CreativeCategory | null>([
  ["banners", "BANNER"],
  ["banner", "BANNER"],
  ["bannieres", "BANNER"],
  ["videos", null],
  ["video", null],
  ["images", null],
  ["image", null],
  ["pdf", "DOCUMENT"],
  ["pdfs", "DOCUMENT"],
  ["documents", "DOCUMENT"],
  ["docs", "DOCUMENT"],
]);

export function platformFolder(segments: string[]): { platform: string | null; category: CreativeCategory | null } | null {
  const index = segments.findIndex((s) => MEDIA_FOLDERS.has(normalizeMatchKey(s)));
  if (index < 0) return null;
  return { platform: index > 0 ? segments[index - 1] : null, category: MEDIA_FOLDERS.get(normalizeMatchKey(segments[index])) ?? null };
}
