/**
 * Per-request security headers for pages (Phase 7, S5).
 *
 * - A fresh CSP nonce for every page request. Next.js reads it from the
 *   request's `Content-Security-Policy` header and attaches it to its own
 *   scripts and styles (this needs dynamic rendering; see app/layout.tsx).
 * - HSTS and `upgrade-insecure-requests` only when the request arrived over
 *   HTTPS (directly or behind a proxy that sets `x-forwarded-proto`).
 * - `CSP_REPORT_ONLY=true` sends the policy as Report-Only (violations are
 *   logged in the browser console, nothing is blocked) for testing a change.
 *
 * Static assets and the `/api` proxy are excluded: they don't execute in a page
 * context, and the API keeps the backend's own headers.
 */
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, HSTS_VALUE } from "@/lib/security/headers";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const https = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = contentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV === "development", https });
  const reportOnly = process.env.CSP_REPORT_ONLY === "true";
  const cspHeader = reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  // Next.js reads the nonce from the request's Content-Security-Policy header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeader, csp);
  if (https) response.headers.set("Strict-Transport-Security", HSTS_VALUE);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API proxy, static files, image optimisation, icons or the logo.
      source: "/((?!api|_next/static|_next/image|favicon.ico|logo.png).*)",
      // Skip link prefetches (they don't render a document).
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
