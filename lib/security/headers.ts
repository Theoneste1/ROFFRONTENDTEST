/**
 * Security headers (Phase 7, S5).
 *
 * - `contentSecurityPolicy()` builds the per-request CSP used by `proxy.ts`.
 *   Scripts and <style> elements must carry the request's nonce; Next.js
 *   attaches it automatically during rendering. No `unsafe-inline` for
 *   scripts or style elements, and `unsafe-eval` only in development (React
 *   needs it there for error overlays; never in production).
 * - `STATIC_SECURITY_HEADERS` are the same for every response and are set in
 *   `next.config.ts` (identical to the values in `netlify.toml`).
 *
 * The browser talks to this origin — the API is proxied under `/api`, fonts
 * are self-hosted by next/font, images are local, downloads use `blob:` URLs —
 * plus the backend origin in NEXT_PUBLIC_API_UPLOAD_ORIGIN. `connect-src`
 * allows connections to that whole origin (any path or method, by fetch, XHR,
 * WebSocket or beacon): CSP cannot limit it to particular paths. The
 * application itself uses the origin only for multipart file uploads
 * (lib/api/client.ts); the backend still requires the access token and
 * enforces CORS for those requests.
 *
 * No imports: next.config.ts loads this file at build time, and its loader
 * cannot follow further TypeScript imports.
 */

/** Same rule as lib/api/upload-origin.ts: only an http(s) origin, else none. */
function uploadOriginForCsp(): string {
  try {
    const url = new URL((process.env.NEXT_PUBLIC_API_UPLOAD_ORIGIN ?? "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function contentSecurityPolicy({ nonce, isDev, https }: { nonce: string; isDev: boolean; https: boolean }): string {
  const UPLOAD_ORIGIN = uploadOriginForCsp();
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${UPLOAD_ORIGIN ? ` ${UPLOAD_ORIGIN}` : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Only over HTTPS: on plain-HTTP local development it would rewrite
    // same-origin requests to https:// and break the app.
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

/** HSTS: sent only on HTTPS responses (browsers ignore it over HTTP anyway). One year; no preload until the owner decides. */
export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

/** Headers that are the same for every response. */
export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
