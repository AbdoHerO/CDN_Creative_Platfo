import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import type { RoleKey, UserStatus, LibraryView } from "@/generated/prisma/enums";

/**
 * Framework-independent session primitives.
 *
 * The browser holds a random 256-bit token; the database stores only its SHA-256
 * hash. Sessions slide forward while in use and are deleted on logout, password
 * change, role change or account deactivation.
 */

export const SESSION_COOKIE = "cmp_session";

export type SessionUser = {
  id: string;
  sessionId: string;
  email: string;
  name: string;
  jobTitle: string | null;
  role: RoleKey;
  status: UserStatus;
  mustChangePassword: boolean;
  showPreviewVersions: boolean;
  libraryView: LibraryView;
  restrictApplications: boolean;
  applicationIds: string[];
};

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionTtlMs(): number {
  return getEnv().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function createSession(userId: string, meta: { ipAddress?: string | null; userAgent?: string | null }) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });
  return { token, expiresAt };
}

/** Validate a raw cookie token. Returns null for unknown, expired or disabled sessions. */
export async function validateSessionToken(token: string): Promise<{ user: SessionUser; expiresAt: Date; renewed: boolean } | null> {
  if (!token || token.length > 200) return null;
  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: {
        include: { role: true, applicationAccess: { select: { applicationId: true } } },
      },
    },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.user.status !== "ACTIVE") {
    await prisma.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }

  // Slide the expiry once less than half of the lifetime remains; refresh
  // lastSeenAt at most every 5 minutes to avoid a write per request.
  const ttl = sessionTtlMs();
  let expiresAt = session.expiresAt;
  let renewed = false;
  const needsRenewal = session.expiresAt.getTime() - now < ttl / 2;
  const needsTouch = now - session.lastSeenAt.getTime() > 5 * 60 * 1000;
  if (needsRenewal || needsTouch) {
    if (needsRenewal) {
      expiresAt = new Date(now + ttl);
      renewed = true;
    }
    await prisma.session
      .update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } })
      .catch(() => undefined);
  }

  const u = session.user;
  return {
    expiresAt,
    renewed,
    user: {
      id: u.id,
      sessionId: id,
      email: u.email,
      name: u.name,
      jobTitle: u.jobTitle,
      role: u.role.key,
      status: u.status,
      mustChangePassword: u.mustChangePassword,
      showPreviewVersions: u.showPreviewVersions,
      libraryView: u.libraryView,
      restrictApplications: u.restrictApplications,
      applicationIds: u.applicationAccess.map((a) => a.applicationId),
    },
  };
}

export async function invalidateSession(sessionId: string) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}
