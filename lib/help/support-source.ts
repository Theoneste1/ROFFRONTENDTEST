/**
 * Where the server reads ROF's official support details for the PDF guide (GET /api/v1/support): the backend address
 * the deployment is configured with (API_PROXY_TARGET, a server-side setting) — never derived from the request, whose
 * Host header a client controls (review 2026-11-28: a spoofed Host made the server fetch an address of the client's
 * choosing and print its answer into the PDF). Null when no backend is configured.
 */
export function officialSupportUrl(env: Record<string, string | undefined> = process.env): string | null {
  const target = (env.API_PROXY_TARGET ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/i.test(target)) return null;
  return `${target}/api/v1/support`;
}
