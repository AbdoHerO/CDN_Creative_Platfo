import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { SessionUser } from "@/lib/auth/session-core";
import { AppError, AuthError, ForbiddenError, toPublicError } from "@/lib/errors";
import { can, type Permission } from "@/lib/permissions";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isSameOrigin, requestMetaFromHeaders } from "@/lib/request";
import { parseInput } from "./action-utils";

type Options = {
  permission?: Permission;
  /** Require a same-origin request (CSRF protection for cookie auth). */
  mutating?: boolean;
  rateLimit?: { key: string; limit: number; windowSeconds: number };
};

export async function apiUser(request: Request, opts: Options = {}): Promise<SessionUser> {
  if (opts.mutating && !isSameOrigin(request.headers)) throw new ForbiddenError("Cross-origin request blocked.");
  const user = await getCurrentUser();
  if (!user) throw new AuthError();
  if (user.mustChangePassword) throw new ForbiddenError("Please change your temporary password first.");
  if (opts.permission && !can(user.role, opts.permission)) throw new ForbiddenError();
  if (opts.rateLimit) {
    await enforceRateLimit(`${opts.rateLimit.key}:${user.id}`, opts.rateLimit.limit, opts.rateLimit.windowSeconds);
  }
  return user;
}

export function apiError(err: unknown) {
  const e = toPublicError(err);
  return NextResponse.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.status });
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("Invalid JSON body.", 400);
  }
  return parseInput(schema, body);
}

export function requestMeta(request: Request) {
  return requestMetaFromHeaders(request.headers);
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}
