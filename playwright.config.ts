import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real application (web app + worker + database +
 * S3-compatible storage). Prerequisites: `npm run db:seed` with
 * SEED_DEMO_USERS=true, `npm run worker` running, storage configured.
 * By default an already running server on E2E_BASE_URL is reused; otherwise
 * `npm run start` is launched (after `npm run build`).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: "npm run start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
