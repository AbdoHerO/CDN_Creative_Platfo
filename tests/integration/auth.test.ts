import { beforeEach, describe, expect, it } from "vitest";
import { generateTemporaryPassword, hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { createSession, hashToken, invalidateUserSessions, validateSessionToken } from "@/lib/auth/session-core";
import { prisma } from "@/lib/db";
import { isRateLimited, rateLimit } from "@/lib/rate-limit";
import { resetDatabase, seedWorld, type World } from "./helpers";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("Correct-Horse-42");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "Correct-Horse-42")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("generates temporary passwords that satisfy the policy", () => {
    for (let i = 0; i < 20; i++) expect(passwordSchema.safeParse(generateTemporaryPassword()).success).toBe(true);
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
  });
});

describe("sessions", () => {
  it("stores only a hash of the token and resolves the user with role and access", async () => {
    const { token } = await createSession(world.users.restricted.id, { ipAddress: "10.0.0.1", userAgent: "vitest" });
    expect(await prisma.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(token) } })).not.toBeNull();
    const result = await validateSessionToken(token);
    expect(result?.user.email).toBe("restricted@test.local");
    expect(result?.user.role).toBe("CREATOR");
    expect(result?.user.applicationIds).toEqual([world.apps.alpha]);
  });

  it("rejects unknown, expired and disabled-user sessions", async () => {
    expect(await validateSessionToken("garbage")).toBeNull();
    const { token } = await createSession(world.users.creator.id, {});
    await prisma.session.update({ where: { id: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();

    const second = await createSession(world.users.creator.id, {});
    await prisma.user.update({ where: { id: world.users.creator.id }, data: { status: "DISABLED" } });
    expect(await validateSessionToken(second.token)).toBeNull();
  });

  it("slides the expiry forward when more than half of the lifetime has elapsed", async () => {
    const { token } = await createSession(world.users.creator.id, {});
    await prisma.session.update({ where: { id: hashToken(token) }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    const result = await validateSessionToken(token);
    expect(result?.renewed).toBe(true);
    expect(result!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 24 * 3600_000);
  });

  it("can sign a user out everywhere except the current session", async () => {
    const a = await createSession(world.users.creator.id, {});
    const b = await createSession(world.users.creator.id, {});
    await invalidateUserSessions(world.users.creator.id, hashToken(a.token));
    expect(await validateSessionToken(a.token)).not.toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("counts within a window across calls (shared via the database)", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("test:key", 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    await prisma.rateLimit.update({ where: { key: "test:key" }, data: { windowStart: new Date(Date.now() - 61_000) } });
    expect((await rateLimit("test:key", 3, 60)).ok).toBe(true);
  });

  it("checks a limit without consuming it (used so that only failed sign-ins count)", async () => {
    expect(await isRateLimited("login:email:x", 2, 60)).toBe(false);
    await rateLimit("login:email:x", 2, 60);
    expect(await isRateLimited("login:email:x", 2, 60)).toBe(false);
    await rateLimit("login:email:x", 2, 60);
    expect(await isRateLimited("login:email:x", 2, 60)).toBe(true);
    expect(await isRateLimited("login:email:x", 2, 60)).toBe(true);
    expect((await prisma.rateLimit.findUniqueOrThrow({ where: { key: "login:email:x" } })).count).toBe(2);
  });
});
