import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getEnv } from "@/lib/env";
import { AuthError, ForbiddenError } from "@/lib/errors";
import { can, type Permission } from "@/lib/permissions";
import { requestMetaFromHeaders } from "@/lib/request";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./session-core";

/**
 * Data Access Layer entry point: every page, server action and route handler
 * resolves the current user through these helpers.
 */

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await validateSessionToken(token);
  if (!result) return null;
  if (result.renewed) {
    // Cookies can only be written from actions/route handlers; ignore elsewhere.
    try {
      jar.set(SESSION_COOKIE, token, sessionCookieOptions(result.expiresAt));
    } catch {
      /* rendering a Server Component */
    }
  }
  return result.user;
});

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production" || getEnv().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** For pages: redirect to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: redirect away when the role lacks a permission. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireActionUser(permission?: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError();
  if (user.mustChangePassword) throw new ForbiddenError("Please change your temporary password first.");
  if (permission && !can(user.role, permission)) throw new ForbiddenError();
  return user;
}

export async function getRequestMeta() {
  return requestMetaFromHeaders(await headers());
}
