import { NextResponse, type NextRequest } from "next/server";

/**
 * Network boundary:
 * - Adds a per-request CSP nonce and security headers.
 * - Redirects requests without a session cookie to /login (fast path). The
 *   session itself is validated against the database in the data access layer
 *   (src/lib/auth/current-user.ts) on every page, action and API call.
 */

const SESSION_COOKIE = "cmp_session";
const PUBLIC_PATHS = ["/login", "/api/health"];

function storageOrigin(): string {
  const endpoint = process.env.URL_RUSTFS?.trim();
  try {
    return endpoint ? new URL(endpoint).origin : "";
  } catch {
    return "";
  }
}

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV !== "production";
  // Presigned URLs are path-style, so the storage endpoint is a single origin.
  const storageSources = storageOrigin();
  return [
    `default-src 'self'`,
    // 'wasm-unsafe-eval' allows WebAssembly (in-browser SHA-256 of uploads) without allowing JS eval().
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${storageSources}`,
    `media-src 'self' blob: ${storageSources}`,
    `connect-src 'self' ${storageSources}${isDev ? " ws: wss:" : ""}`,
    `frame-src 'self' blob: ${storageSources}`,
    `font-src 'self' data:`,
    // pdf.js renders PDFs in a web worker served from /pdfjs.
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // Pages stream (loading skeleton first, then content): ask nginx-style proxies not to buffer.
  response.headers.set("X-Accel-Buffering", "no");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Static assets (pdf.js runtime, app icons, manifest) skip the proxy: the
      // install prompt fetches the manifest and icons before anyone signs in.
      source: "/((?!_next/static|_next/image|pdfjs/|icons/|manifest.webmanifest|favicon.ico|robots.txt).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
