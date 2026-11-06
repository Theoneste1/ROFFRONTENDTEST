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
 * The browser only talks to this origin: the API is proxied under `/api`, fonts
 * are self-hosted by next/font, and images are local. Downloads use `blob:` URLs.
 */

export function contentSecurityPolicy({ nonce, isDev, https }: { nonce: string; isDev: boolean; https: boolean }): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
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
