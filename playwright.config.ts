import { defineConfig, devices } from "@playwright/test";

// Local runs: Playwright starts its own e2e-mode dev server on port 5174
// (separate from `pnpm dev` on 5173) and reuses it across runs.
// CI runs: BASE_URL points at the ephemeral deployment and no server starts.
const baseURL = process.env.BASE_URL ?? "http://localhost:5174";

export const E2E_USER_EMAIL = "e2e@stelplaats.test";

export const e2eHeaders = {
  "X-Test-User-Email": E2E_USER_EMAIL,
  "X-Test-Auth": process.env.TEST_AUTH_TOKEN ?? "local-test-token",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI === undefined ? 0 : 2,
  // Single worker: tests share one database and reset it between tests.
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    extraHTTPHeaders: e2eHeaders,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.BASE_URL === undefined
    ? {
        webServer: {
          command: "pnpm dev:e2e",
          url: "http://localhost:5174",
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
