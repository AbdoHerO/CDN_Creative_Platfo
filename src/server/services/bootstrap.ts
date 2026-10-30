import type { RoleKey } from "@/generated/prisma/enums";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { badgeSlug, DEFAULT_BADGES } from "@/lib/badges";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import type { Db } from "@/lib/db";

/**
 * First-run bootstrap, safe to run on every start (`prisma/bootstrap.ts`, run by
 * the production container after the migrations):
 * - the four roles always exist;
 * - the first admin is created from SEED_ADMIN_* only when there is no admin at all;
 * - on a brand-new database (empty tables) the initial platforms and default
 *   badges are added.
 * Nothing that already exists is changed or re-created: a renamed platform or a
 * deleted badge stays as the admins left it.
 */

export const INITIAL_APPLICATIONS = [
  { name: "Win+Pharma", slug: "win-pharma", brandColor: "#16A34A", description: "Pharmacy management and ordering platform." },
  { name: "iCoral", slug: "icoral", brandColor: "#F26B5B", description: "iCoral mobile application and brand assets." },
  { name: "Pharmalien", slug: "pharmalien", brandColor: "#2563EB", description: "Pharmalien network communication and marketing." },
  { name: "WinMed", slug: "winmed", brandColor: "#0D9488", description: "WinMed medical solutions and campaigns." },
];

const ROLES: RoleKey[] = ["ADMIN", "MANAGER", "CREATOR", "VIEWER"];

export async function ensureRoles(db: Db): Promise<Record<RoleKey, string>> {
  for (const key of ROLES) {
    await db.role.upsert({
      where: { key },
      create: { key, name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key] },
      update: { name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key] },
    });
  }
  return Object.fromEntries((await db.role.findMany()).map((r) => [r.key, r.id])) as Record<RoleKey, string>;
}

export type AdminInput = { email?: string; password?: string; name?: string };

export type AdminResult =
  | { created: true; email: string; temporaryPassword: string | null }
  | { created: false; reason: "admin-exists" | "email-taken"; email: string };

/**
 * Create the first admin unless an admin already exists. A password shorter
 * than 10 characters (or none) is replaced by a temporary one that must be
 * changed at first sign-in.
 */
export async function ensureAdmin(db: Db, input: AdminInput, roles: Record<RoleKey, string>): Promise<AdminResult> {
  const email = (input.email || "admin@example.com").trim().toLowerCase();
  if (await db.user.count({ where: { roleId: roles.ADMIN } })) return { created: false, reason: "admin-exists", email };
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return { created: false, reason: "email-taken", email };

  const provided = input.password ?? "";
  const useProvided = provided.length >= 10;
  const password = useProvided ? provided : generateTemporaryPassword();
  await db.user.create({
    data: {
      email,
      name: input.name || "Platform Admin",
      jobTitle: "Administrator",
      passwordHash: await hashPassword(password),
      roleId: roles.ADMIN,
      mustChangePassword: !useProvided,
    },
  });
  return { created: true, email, temporaryPassword: useProvided ? null : password };
}

export async function bootstrap(db: Db, admin: AdminInput, log: (line: string) => void = console.log) {
  const roles = await ensureRoles(db);

  const result = await ensureAdmin(db, admin, roles);
  if (result.created) {
    log(`✔ Admin account created: ${result.email}`);
    if (result.temporaryPassword) {
      if (admin.password) log("! SEED_ADMIN_PASSWORD is shorter than 10 characters; a temporary password was generated instead.");
      log(`  Temporary password (must be changed at first sign-in): ${result.temporaryPassword}`);
    } else {
      log("  Sign in with the password set in SEED_ADMIN_PASSWORD.");
    }
  } else if (result.reason === "email-taken") {
    log(`! No admin exists, but ${result.email} is already used by another account: no admin was created.`);
  } else {
    log("• An admin account already exists");
  }

  if ((await db.application.count()) === 0) {
    for (const [index, app] of INITIAL_APPLICATIONS.entries()) await db.application.create({ data: { ...app, sortOrder: index } });
    log(`✔ Initial platforms: ${INITIAL_APPLICATIONS.map((a) => a.name).join(", ")}`);
  }

  if ((await db.badge.count()) === 0) {
    for (const [index, badge] of DEFAULT_BADGES.entries()) {
      await db.badge.create({ data: { ...badge, slug: badgeSlug(badge.name), sortOrder: index } });
    }
    log(`✔ Default badges: ${DEFAULT_BADGES.map((b) => b.name).join(", ")}`);
  }

  return { roles, admin: result };
}
