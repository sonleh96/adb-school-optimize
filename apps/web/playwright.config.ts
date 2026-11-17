import { defineConfig, devices } from "@playwright/test";

// The launcher reads the same variable, so two checkouts can run their browser tests side by side.
const appPort = process.env.CI_APP_PORT ?? "3105";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/launch-ci-app.mjs",
    url: `http://127.0.0.1:${appPort}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
