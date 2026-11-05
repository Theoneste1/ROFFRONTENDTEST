import type { NextConfig } from "next";

/**
 * The browser talks only to this Next.js server. Every `/api/*` request is
 * proxied to the ROF LMS backend, so the frontend and the API share one origin:
 * no CORS is needed and the backend's `SameSite=Strict` refresh cookie
 * (path `/api/v1/auth`) is sent normally.
 *
 * API_PROXY_TARGET is read when the server starts (see `.env.example`).
 */
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? "http://localhost:3000").replace(/\/+$/, "");

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
