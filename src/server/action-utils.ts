import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { AppError, toPublicError, zodFieldErrors, type ActionResult } from "@/lib/errors";

/**
 * Wrap a server action body: returns a typed result instead of throwing, while
 * letting Next.js control-flow errors (redirect, notFound) propagate.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    const e = toPublicError(err);
    return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  }
}

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("Please correct the highlighted fields.", 422, zodFieldErrors(result.error));
  }
  return result.data;
}
