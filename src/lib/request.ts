import { getEnv } from "@/lib/env";

export type RequestMeta = { ipAddress: string | null; userAgent: string | null };

type HeaderBag = { get(name: string): string | null };

/** Client IP and user agent. Forwarded headers are only trusted when TRUST_PROXY=true. */
export function requestMetaFromHeaders(headers: HeaderBag): RequestMeta {
  const trustProxy = getEnv().TRUST_PROXY ?? false;
  let ip: string | null = null;
  if (trustProxy) {
    ip =
      headers.get("x-real-ip") ??
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
  }
  return { ipAddress: ip, userAgent: headers.get("user-agent")?.slice(0, 500) ?? null };
}

/**
 * CSRF defence for cookie-authenticated route handlers: mutating requests must
 * come from our own origin. (Server Actions already enforce this in Next.js.)
 */
export function isSameOrigin(headers: HeaderBag): boolean {
  const origin = headers.get("origin");
  if (!origin) {
    // Non-browser clients and same-origin GETs may omit Origin; fall back to Fetch Metadata.
    const site = headers.get("sec-fetch-site");
    return site === null || site === "same-origin" || site === "none";
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(getEnv().APP_URL).host);
  } catch {
    // ignore malformed APP_URL; validated elsewhere
  }
  const host = headers.get("host");
  if (host) allowed.add(host);
  if (getEnv().TRUST_PROXY) {
    const fwd = headers.get("x-forwarded-host");
    if (fwd) allowed.add(fwd.split(",")[0].trim());
  }
  return allowed.has(originHost);
}
