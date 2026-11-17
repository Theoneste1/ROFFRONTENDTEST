/**
 * Browser end-to-end tests: the real frontend against the real backend and PostgreSQL (no mocked API for the main
 * workflows). The stack is started outside Playwright (see e2e/README.md):
 *   E2E_BASE_URL       the frontend, e.g. http://localhost:3100 (`next start`, API_PROXY_TARGET = the backend)
 *   E2E_API_URL        the backend, e.g. http://127.0.0.1:4100 (TEACHERS_ENABLED / HEAD_COACHES_ENABLED = true)
 *   E2E_DATABASE_URL   the backend's disposable test database (synthetic data only; never a real database)
 *   E2E_ADMIN_PASSWORD the seeded administrator's password (SEED_ADMIN_PASSWORD)
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /\.mobile\.spec\.ts$/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /\.mobile\.spec\.ts$/ },
  ],
});
