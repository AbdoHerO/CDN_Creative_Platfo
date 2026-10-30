/**
 * Idempotent seed.
 *
 * Always: roles, the four initial applications, the first admin account.
 * Optional (SEED_DEMO_USERS=true, development only): one user per role and a
 * few campaigns/tags so every screen can be exercised. No creatives or files are
 * seeded — those must go through the real upload pipeline (see
 * `npm run demo:media` to upload generated sample media to the bucket).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { generateTemporaryPassword, hashPassword } from "../src/lib/auth/password";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../src/lib/constants";
import type { RoleKey } from "../src/generated/prisma/enums";

const APPLICATIONS = [
  { name: "Win+Pharma", slug: "win-pharma", brandColor: "#16A34A", description: "Pharmacy management and ordering platform." },
  { name: "iCoral", slug: "icoral", brandColor: "#F26B5B", description: "iCoral mobile application and brand assets." },
  { name: "Pharmalien", slug: "pharmalien", brandColor: "#2563EB", description: "Pharmalien network communication and marketing." },
  { name: "WinMed", slug: "winmed", brandColor: "#0D9488", description: "WinMed medical solutions and campaigns." },
];

const ROLES: RoleKey[] = ["ADMIN", "MANAGER", "CREATOR", "VIEWER"];

async function main() {
  for (const key of ROLES) {
    await prisma.role.upsert({
      where: { key },
      create: { key, name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key] },
      update: { name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key] },
    });
  }
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r.id])) as Record<RoleKey, string>;

  for (const [index, app] of APPLICATIONS.entries()) {
    await prisma.application.upsert({
      where: { slug: app.slug },
      create: { ...app, sortOrder: index },
      update: {},
    });
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const provided = process.env.SEED_ADMIN_PASSWORD ?? "";
    // A password shorter than 10 characters is replaced by a temporary one (printed below).
    const useProvided = provided.length >= 10;
    if (provided && !useProvided) console.warn("! SEED_ADMIN_PASSWORD is shorter than 10 characters; generating a temporary password instead.");
    const password = useProvided ? provided : generateTemporaryPassword();
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: process.env.SEED_ADMIN_NAME || "Platform Admin",
        jobTitle: "Administrator",
        passwordHash: await hashPassword(password),
        roleId: roles.ADMIN,
        mustChangePassword: !useProvided,
      },
    });
    console.log(`✔ Admin account created: ${adminEmail}`);
    if (!useProvided) console.log(`  Temporary password (change on first login): ${password}`);
  } else {
    console.log(`• Admin account already exists: ${adminEmail}`);
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
  // `||`, not `??`: `.env.example` ships SEED_DEMO_PASSWORD="" (empty means "use the default").
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
