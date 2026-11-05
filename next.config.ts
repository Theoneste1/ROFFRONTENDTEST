import type { NextConfig } from "next";

/**
 * The browser talks only to this Next.js server. Every `/api/*` request is
 * proxied to the ROF LMS backend, so the frontend and the API share one origin:
 * no CORS is needed and the backend's `SameSite=Strict` refresh cookie
 * (path `/api/v1/auth`) is sent normally.
 *
 * API_PROXY_TARGET is read when the app is built and when the server starts
 * (see `.env.example`). On Netlify it must be set before the build.
 */
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? "http://localhost:3000").replace(/\/+$/, "");

// A hosted build (Netlify sets NETLIFY=true) must point at a public backend;
// fail the build instead of deploying a site whose API calls go nowhere.
if (process.env.NETLIFY === "true") {
  const host = (() => {
    try {
      return new URL(API_PROXY_TARGET).hostname;
    } catch {
      return "";
    }
  })();
  if (!process.env.API_PROXY_TARGET || !host || ["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
    throw new Error(
      "API_PROXY_TARGET must be set to the public URL of the ROF LMS backend (e.g. https://api.example.org) in the Netlify environment variables before building.",
    );
  }
}

const nextConfig: NextConfig = {
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
