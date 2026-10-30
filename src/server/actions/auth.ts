"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getCurrentUser, getRequestMeta, sessionCookieOptions } from "@/lib/auth/current-user";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { createSession, invalidateSession, invalidateUserSessions, SESSION_COOKIE } from "@/lib/auth/session-core";
import { prisma } from "@/lib/db";
import { AppError, AuthError } from "@/lib/errors";
import { enforceRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { parseInput, runAction } from "@/server/action-utils";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(200),
  next: z.string().optional(),
});

// Verifying against a dummy hash for unknown emails keeps response timing uniform.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password-0"));

function safeRedirect(target: string | undefined) {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return "/dashboard";
  if (target.startsWith("/login") || target.startsWith("/api/")) return "/dashboard";
  return target;
}

export async function loginAction(input: z.input<typeof loginSchema>) {
  const result = await runAction(async () => {
    const data = parseInput(loginSchema, input);
    const meta = await getRequestMeta();
    await enforceRateLimit(`login:ip:${meta.ipAddress ?? "unknown"}`, 30, 15 * 60, "Too many sign-in attempts. Try again in a few minutes.");
    await enforceRateLimit(`login:email:${data.email}`, 8, 15 * 60, "Too many sign-in attempts for this account. Try again in 15 minutes.");

    const user = await prisma.user.findUnique({ where: { email: data.email } });
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), data.password);
    if (!user || !valid) {
      await logActivity({
        actorId: user?.id ?? null,
        action: "AUTH_LOGIN_FAILED",
        entityType: "USER",
        entityId: user?.id ?? null,
        summary: `Failed sign-in for ${data.email}`,
        meta,
      });
      throw new AppError("Invalid email or password.", 401);
    }
    if (user.status !== "ACTIVE") {
      throw new AppError("This account is disabled. Contact an administrator.", 403);
    }

    const session = await createSession(user.id, meta);
    (await cookies()).set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await resetRateLimit(`login:email:${data.email}`);
    await logActivity({ actorId: user.id, action: "AUTH_LOGIN", entityType: "USER", entityId: user.id, summary: `${user.name} signed in`, meta });
    return user.mustChangePassword ? "/change-password" : safeRedirect(data.next);
  });
  if (result.ok) redirect(result.data);
  return result;
}

export async function logoutAction() {
  const user = await getCurrentUser();
  const jar = await cookies();
  if (user) {
    await invalidateSession(user.sessionId);
    await logActivity({
      actorId: user.id,
      action: "AUTH_LOGOUT",
      entityType: "USER",
      entityId: user.id,
      summary: `${user.name} signed out`,
      meta: await getRequestMeta(),
    });
  }
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password." });

export async function changePasswordAction(input: z.input<typeof changePasswordSchema>) {
  return runAction(async () => {
    const current = await getCurrentUser();
    if (!current) throw new AuthError();
    const data = parseInput(changePasswordSchema, input);
    await enforceRateLimit(`password:${current.id}`, 10, 15 * 60);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    if (!(await verifyPassword(user.passwordHash, data.currentPassword))) {
      throw new AppError("Current password is incorrect.", 400, { currentPassword: "Current password is incorrect." });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.newPassword), mustChangePassword: false, passwordChangedAt: new Date() },
    });
    // Sign out every other device.
    await invalidateUserSessions(user.id, current.sessionId);
    await logActivity({
      actorId: user.id,
      action: "PASSWORD_CHANGED",
      entityType: "USER",
      entityId: user.id,
      summary: `${user.name} changed their password`,
      meta: await getRequestMeta(),
    });
    return true;
  }, "Password updated. Other sessions were signed out.");
}

export async function revokeSessionAction(sessionId: string) {
  return runAction(async () => {
    const current = await getCurrentUser();
    if (!current) throw new AuthError();
    await prisma.session.deleteMany({ where: { id: sessionId, userId: current.id, NOT: { id: current.sessionId } } });
    return true;
  }, "Session revoked.");
}
