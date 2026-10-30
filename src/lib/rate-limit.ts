import { prisma } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by PostgreSQL so limits hold across every
 * application instance. One atomic upsert per check.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}::int)
                     THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}::int)
                     THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count", "windowStart"`;
  const row = rows[0];
  const count = Number(row?.count ?? 1);
  const resetAt = new Date((row?.windowStart ?? new Date()).getTime() + windowSeconds * 1000);
  return { ok: count <= limit, count, remaining: Math.max(0, limit - count), resetAt };
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimit.delete({ where: { key } }).catch(() => undefined);
}

export class RateLimitError extends Error {
  constructor(
    message = "Too many requests. Please wait a moment and try again.",
    public resetAt?: Date,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const res = await rateLimit(key, limit, windowSeconds);
  if (!res.ok) throw new RateLimitError(message, res.resetAt);
  return res;
}
