/**
 * Origin of the backend for file uploads, from NEXT_PUBLIC_API_UPLOAD_ORIGIN
 * (public, inlined at build time), e.g. `https://rofbackendtest.onrender.com`.
 *
 * When set, multipart uploads go straight to the backend instead of through
 * the `/api` proxy: hosting proxies limit request bodies (Netlify: about 8 MB
 * and ~26 s) while the backend accepts files up to 50 MB. Uploads authenticate
 * with the bearer token only — the refresh cookie stays same-origin. Empty or
 * invalid → "" and every request, uploads included, uses the proxy.
 */
export function uploadOrigin(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

export const UPLOAD_ORIGIN = uploadOrigin(process.env.NEXT_PUBLIC_API_UPLOAD_ORIGIN);
