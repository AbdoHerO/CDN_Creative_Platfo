import type { Db } from "@/lib/db";
import { slugify } from "@/lib/ids";

export function normalizeTagNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (!name) continue;
    const slug = slugify(name);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(name);
  }
  return out.slice(0, 30);
}

/** Upsert tags by slug and return their ids. */
export async function ensureTags(db: Db, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of normalizeTagNames(names)) {
    const slug = slugify(name);
    const tag = await db.tag.upsert({ where: { slug }, create: { name, slug }, update: {}, select: { id: true } });
    ids.push(tag.id);
  }
  return ids;
}

export function normalizeKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).map((k) => k.slice(0, 60)))].slice(0, 50);
}
