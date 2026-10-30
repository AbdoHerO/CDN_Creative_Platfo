import { randomBytes } from "node:crypto";

/**
 * Collision-resistant, URL-safe id compatible with Prisma's cuid columns. Used
 * when an id is needed before the row exists (e.g. to build an object key).
 */
export function newId(): string {
  return `c${Date.now().toString(36)}${randomBytes(9).toString("hex")}`;
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\+/g, "-plus")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}
