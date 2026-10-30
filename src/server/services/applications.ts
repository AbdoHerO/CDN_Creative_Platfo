import type { Db } from "@/lib/db";
import { normalizeMatchKey } from "@/lib/files/naming";
import { slugify } from "@/lib/ids";

/** First free slug for an application name ("name", "name-2", …). */
export async function uniqueApplicationSlug(db: Db, name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const existing = await db.application.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

/** Keys an import folder name is compared with: `win+pharma` ↔ "Win+Pharma". */
export function applicationKeys(app: { name: string; slug: string }): Set<string> {
  return new Set([normalizeMatchKey(app.name), normalizeMatchKey(app.slug)]);
}

/**
 * Display name for a platform created from an import folder. The folder name
 * is kept as written (only trimmed and shortened) so it is easy to recognise;
 * admins can rename it later.
 */
export function applicationNameFromFolder(folder: string): string {
  return folder.trim().replace(/\s+/g, " ").slice(0, 80);
}

/** Create an application for a new platform folder, or reuse one with the same name. */
export async function ensureApplication(db: Db, folder: string) {
  const name = applicationNameFromFolder(folder);
  const key = normalizeMatchKey(name);
  const existing = (await db.application.findMany({ select: { id: true, name: true, slug: true } })).find((a) => applicationKeys(a).has(key));
  if (existing) return { id: existing.id, name: existing.name, created: false };
  const maxOrder = await db.application.aggregate({ _max: { sortOrder: true } });
  const app = await db.application.create({
    data: { name, slug: await uniqueApplicationSlug(db, name), sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
    select: { id: true, name: true },
  });
  return { ...app, created: true };
}
