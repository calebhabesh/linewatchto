import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const stubUrl = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/smoke",
  outputDir: "/tmp/linewatch-playwright-test-results",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: appUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/smoke/api-stub.mjs",
      url: `${stubUrl}/__test/health`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command:
        "BACKEND_URL=http://127.0.0.1:4174 NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://127.0.0.1:4174 npm run build && BACKEND_URL=http://127.0.0.1:4174 NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://127.0.0.1:4174 npm run start -- --hostname 127.0.0.1 --port 4173",
      url: appUrl,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "desktop-firefox",
      testMatch: /browser-compat\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "desktop-webkit",
      testMatch: /browser-compat\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
