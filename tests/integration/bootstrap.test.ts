import { beforeEach, describe, expect, it } from "vitest";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { bootstrap } from "@/server/services/bootstrap";
import { resetDatabase } from "./helpers";

const quiet = () => undefined;

beforeEach(async () => {
  await resetDatabase();
});

describe("first-run bootstrap", () => {
  it("fills an empty database: roles, admin, platforms and badges", async () => {
    const { admin } = await bootstrap(prisma, { email: "Admin@CMP.local", password: "Admin-Password-2026", name: "Ops" }, quiet);
    expect(admin).toMatchObject({ created: true, email: "admin@cmp.local", temporaryPassword: null });

    expect(await prisma.role.count()).toBe(4);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@cmp.local" }, include: { role: true } });
    expect(user.role.key).toBe("ADMIN");
    expect(user.name).toBe("Ops");
    expect(user.mustChangePassword).toBe(false);
    expect(await verifyPassword(user.passwordHash, "Admin-Password-2026")).toBe(true);
    expect((await prisma.application.findMany({ orderBy: { sortOrder: "asc" } })).map((a) => a.name)).toEqual(["Win+Pharma", "iCoral", "Pharmalien", "WinMed"]);
    expect(await prisma.badge.count()).toBe(4);
  });

  it("changes nothing on later runs: no duplicate admin, deleted badges and renamed platforms stay", async () => {
    await bootstrap(prisma, { email: "admin@cmp.local", password: "Admin-Password-2026" }, quiet);
    await prisma.badge.delete({ where: { slug: "3d" } });
    await prisma.application.update({ where: { slug: "winmed" }, data: { name: "WinMed Pro", slug: "winmed-pro" } });
    await prisma.user.update({ where: { email: "admin@cmp.local" }, data: { email: "owner@company.com" } });

    const second = await bootstrap(prisma, { email: "admin@cmp.local", password: "Another-Password-1" }, quiet);
    expect(second.admin).toMatchObject({ created: false, reason: "admin-exists" });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.badge.count()).toBe(3);
    expect(await prisma.application.count()).toBe(4);
    expect(await prisma.application.findUnique({ where: { slug: "winmed" } })).toBeNull();
  });

  it("generates a temporary password when none (or a short one) is configured", async () => {
    const { admin } = await bootstrap(prisma, { email: "admin@cmp.local", password: "short" }, quiet);
    expect(admin.created && admin.temporaryPassword).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@cmp.local" } });
    expect(user.mustChangePassword).toBe(true);
    expect(await verifyPassword(user.passwordHash, admin.created ? admin.temporaryPassword! : "")).toBe(true);
  });
});
