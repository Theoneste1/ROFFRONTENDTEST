import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security/headers";

/**
 * The browser talks only to this Next.js server. Every `/api/*` request is
 * proxied to the ROF LMS backend, so the frontend and the API share one origin:
 * no CORS is needed and the backend's `SameSite=Strict` refresh cookie
 * (path `/api/v1/auth`) is sent normally.
 *
 * API_PROXY_TARGET is read when the app is built and when the server starts
 * (see `.env.example`). On Vercel it must be set (Project → Settings → Environment Variables) before the build.
 */
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? "http://localhost:3000").replace(/\/+$/, "");

// A hosted build (Vercel sets VERCEL=1) must point at a public backend;
// fail the build instead of deploying a site whose API calls go nowhere.
if (process.env.VERCEL === "1") {
  const host = (() => {
    try {
      return new URL(API_PROXY_TARGET).hostname;
    } catch {
      return "";
    }
  })();
  if (!process.env.API_PROXY_TARGET || !host || ["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
    throw new Error(
      "API_PROXY_TARGET must be set to the public URL of the ROF LMS backend (e.g. https://api.example.org) in the Vercel project's environment variables before building.",
    );
  }
}

const nextConfig: NextConfig = {
  // Same for every response.
  // The per-request CSP and HSTS are set in proxy.ts.
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
