/**
 * Errors with messages that are safe to show to users. Anything else is logged
 * and replaced with a generic message.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super(message, 401);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested item was not found.") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Map any thrown value to a user-safe message + HTTP status. */
export function toPublicError(err: unknown): { message: string; status: number; fieldErrors?: Record<string, string> } {
  if (err instanceof AppError) return { message: err.message, status: err.status, fieldErrors: err.fieldErrors };
  const named = err as { name?: string; message?: string };
  if (named?.name === "RateLimitError") return { message: named.message ?? "Too many requests.", status: 429 };
  if (named?.name === "StorageNotConfiguredError") return { message: named.message ?? "Storage is not configured.", status: 503 };
  if (named?.name === "WorkflowError") return { message: named.message ?? "Invalid status change.", status: 409 };
  console.error(err);
  return { message: "Something went wrong. Please try again.", status: 500 };
}
