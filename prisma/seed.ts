/**
 * Idempotent seed.
 *
 * Always: roles, the four initial applications, the default badges, the first admin
 * account (when no admin exists). Production starts run the lighter
 * `prisma/bootstrap.ts`, which only fills an empty database.
 * Optional (SEED_DEMO_USERS=true, development only): one user per role and a
 * few campaigns/tags so every screen can be exercised. No creatives or files are
 * seeded — those must go through the real upload pipeline (see
 * `npm run demo:media` to upload generated sample media to the bucket).
 */
import "../src/lib/load-env";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { badgeSlug, DEFAULT_BADGES } from "../src/lib/badges";
import type { RoleKey } from "../src/generated/prisma/enums";
import { ensureAdmin, ensureRoles, INITIAL_APPLICATIONS } from "../src/server/services/bootstrap";

async function main() {
  const roles = await ensureRoles(prisma);

  for (const [index, app] of INITIAL_APPLICATIONS.entries()) {
    await prisma.application.upsert({
      where: { slug: app.slug },
      create: { ...app, sortOrder: index },
      update: {},
    });
  }

  // Default badges (created once; admins can rename, recolour or delete them).
  for (const [index, badge] of DEFAULT_BADGES.entries()) {
    await prisma.badge.upsert({
      where: { slug: badgeSlug(badge.name) },
      create: { ...badge, slug: badgeSlug(badge.name), sortOrder: index },
      update: {},
    });
  }

  const admin = await ensureAdmin(
    prisma,
    { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, name: process.env.SEED_ADMIN_NAME },
    roles,
  );
  if (admin.created) {
    console.log(`✔ Admin account created: ${admin.email}`);
    if (admin.temporaryPassword) console.log(`  Temporary password (change on first login): ${admin.temporaryPassword}`);
  } else {
    console.log(admin.reason === "admin-exists" ? "• An admin account already exists" : `! ${admin.email} is used by another account: no admin created`);
  }

  if (process.env.SEED_DEMO_USERS === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Refusing to seed demo users with NODE_ENV=production.");
    }
    await seedDemo(roles);
  }

  console.log("✔ Seed complete");
}

async function seedDemo(roles: Record<RoleKey, string>) {
  // `||`, not `??`: `.env.dev.example` ships SEED_DEMO_PASSWORD="" (empty means "use the default").
  const password = process.env.SEED_DEMO_PASSWORD || "Demo-Password-2026";
  const passwordHash = await hashPassword(password);
  const users: { email: string; name: string; role: RoleKey; jobTitle: string }[] = [
    { email: "manager@cmp.local", name: "Maya Manager", role: "MANAGER", jobTitle: "Marketing Manager" },
    { email: "creator@cmp.local", name: "Chris Creator", role: "CREATOR", jobTitle: "Motion Designer" },
    { email: "viewer@cmp.local", name: "Val Viewer", role: "VIEWER", jobTitle: "Sales Representative" },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, jobTitle: u.jobTitle, passwordHash, roleId: roles[u.role] },
      update: {},
    });
  }
  console.log(`✔ Demo users (password "${password}"): ${users.map((u) => u.email).join(", ")}`);

  const tagNames = ["summer", "launch", "awareness", "promotion", "social", "b2b"];
  for (const name of tagNames) {
    await prisma.tag.upsert({ where: { slug: name }, create: { name, slug: name }, update: {} });
  }

  const apps = await prisma.application.findMany();
  const admin = await prisma.user.findFirst({ where: { role: { key: "ADMIN" } } });
  const year = new Date().getFullYear();
  for (const app of apps) {
    const campaigns = [
      { name: `Summer Campaign ${year}`, status: "ACTIVE" as const, startDate: new Date(`${year}-06-01`), endDate: new Date(`${year}-08-31`), tags: ["summer", "promotion"] },
      { name: "Product Launch", status: "PLANNED" as const, startDate: new Date(`${year}-11-01`), endDate: new Date(`${year}-12-15`), tags: ["launch", "awareness"] },
    ];
    for (const c of campaigns) {
      const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const existing = await prisma.campaign.findUnique({ where: { applicationId_slug: { applicationId: app.id, slug } } });
      if (existing) continue;
      const tags = await prisma.tag.findMany({ where: { slug: { in: c.tags } } });
      await prisma.campaign.create({
        data: {
          name: c.name,
          slug,
          applicationId: app.id,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          description: `${c.name} for ${app.name}.`,
          createdById: admin?.id,
          tags: { create: tags.map((t) => ({ tagId: t.id })) },
        },
      });
    }
  }
  console.log("✔ Demo campaigns and tags");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
