import { defineConfig } from "@playwright/test";

// Dedicated ports and build output prevent captures from reusing stale builds or
// mutating a developer's running smoke/demo session.
export default defineConfig({
  testDir: "./tests/onboarding",
  testMatch: ["capture.spec.ts", "verify.spec.ts"],
  outputDir: "/tmp/linewatch-onboarding-results",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4193",
    browserName: "chromium",
    channel: "chromium",
    deviceScaleFactor: 2,
    colorScheme: "dark",
    contextOptions: { reducedMotion: "reduce" },
    locale: "en-CA",
    timezoneId: "America/Toronto",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/smoke/api-stub.mjs",
      env: { LINEWATCH_STUB_PORT: "4194", LINEWATCH_ONBOARDING_CAPTURE: "true" },
      url: "http://127.0.0.1:4194/__test/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 4193",
      env: {
        NEXT_DIST_DIR: ".next-onboarding",
        BACKEND_URL: "http://127.0.0.1:4194",
        NEXT_PUBLIC_LINEWATCH_API_BASE_URL: "http://127.0.0.1:4194",
      },
      url: "http://127.0.0.1:4193",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
  ],
});
