import { defineConfig, devices } from "@playwright/test";

const appUrl = "http://127.0.0.1:4173";
const stubUrl = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/smoke",
  outputDir: "/tmp/linewatch-playwright-test-results",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The API stub has intentionally mutable scenario state. Keep a single
  // worker until scenarios are isolated per browser context.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    },
  },
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
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/start-playwright-app.mjs",
      url: appUrl,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
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
      name: "mobile-webkit",
      testMatch: /mobile-map-fit\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
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
