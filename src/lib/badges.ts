import { normalizeMatchKey, parseFilename } from "@/lib/files/naming";
import { slugify } from "@/lib/ids";

/** Badges created by the seed; admins can rename, recolour or delete them. */
export const DEFAULT_BADGES = [
  { name: "Motion graphique", color: "#8B5CF6" },
  { name: "Higgsfield", color: "#0EA5E9" },
  { name: "3D", color: "#F59E0B" },
  { name: "Sans miniature", color: "#64748B" },
] as const;

/**
 * Badges whose name appears as whole words in a filename:
 * `icoral-s01-liberte-higgsfield.mp4` → Higgsfield, `spot_3d_reel.mp4` → 3D.
 */
export function badgesForFilename<T extends { name: string }>(badges: T[], filename: string): T[] {
  const words = normalizeMatchKey(parseFilename(filename).baseStem).split("_");
  return badges.filter((b) => {
    const badgeWords = normalizeMatchKey(b.name).split("_");
    return words.some((_, i) => badgeWords.every((w, j) => words[i + j] === w));
  });
}

export function badgeSlug(name: string) {
  return slugify(name);
}
