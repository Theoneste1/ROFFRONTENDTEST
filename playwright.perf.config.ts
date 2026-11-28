/**
 * Navigation measurements (not a test suite; never run in CI): `npx playwright test -c playwright.perf.config.ts`.
 * Same stack and accounts as the browser tests (playwright.config.ts). PERF_LATENCY_MS (default 400) is added to every
 * request in Chromium, the round trip measured from Kigali to the hosted API (Cloudflare edge DUR → Render, Ohio).
 * Results: e2e/perf/results/<PERF_LABEL>.json.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/perf",
  testMatch: /\.perf\.ts$/,
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60_000,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
});
