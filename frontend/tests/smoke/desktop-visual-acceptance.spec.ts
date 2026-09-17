import { expect, test } from "@playwright/test";
import { appUrl, setStubMode } from "./test-support";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const SCREENSHOT_DIR = join(process.cwd(), "test-results", "acceptance-screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

type PrepareOptions = {
  theme?: "dark" | "light";
  network?: "ttc" | "regional";
  viewport?: { width: number; height: number };
};

async function prepareDesktopPage(page: import("@playwright/test").Page, options: PrepareOptions = {}) {
  const theme = options.theme ?? "dark";
  const network = options.network ?? "ttc";
  const viewport = options.viewport ?? { width: 1440, height: 900 };

  await page.setViewportSize(viewport);
  await page.clock.setFixedTime("2026-08-14T16:00:00.000Z");
  await page.emulateMedia({
    reducedMotion: "reduce",
    colorScheme: theme,
  });

  const cookieValue = encodeURIComponent(
    JSON.stringify({
      theme,
      highContrast: false,
      reducedMotion: true,
      estimatedTrainsEnabled: false,
      dotBackgroundEnabled: false,
      defaultNetwork: network,
    }),
  );

  await page.context().addCookies([
    {
      name: "linewatch-visual-preferences-v1",
      value: cookieValue,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);

  await page.addInitScript(
    ({ themeValue, networkValue }) => {
      window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
      window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
      window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", "1700000000000");
      window.localStorage.setItem("linewatch-seen-release-notes-version", "1.0.0");
      window.localStorage.setItem("linewatch-reduced-motion-enabled-v1", "true");
      window.localStorage.setItem("linewatch-dot-background-enabled-v1", "false");
      window.localStorage.setItem("linewatch-estimated-trains-enabled-v1", "false");
      window.localStorage.setItem("linewatch-theme-v1", themeValue);
      window.localStorage.setItem("linewatch-default-network-v1", networkValue);
    },
    {
      themeValue: theme,
      networkValue: network,
    },
  );

  await page.goto(`${appUrl}/?previewTime=${encodeURIComponent("2026-08-14T16:00:00.000Z")}`);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      .constellation-background-canvas {
        display: none !important;
      }
    `,
  });

  await page.evaluate(() => document.fonts.ready);
  const mapStage = network === "regional"
    ? page.locator(".regional-map-stage")
    : page.locator(".ttc-map-stage");
  await expect(mapStage).toHaveAttribute("data-raster-map-ready", "true");
  await page.waitForTimeout(300);
}

test.describe("Desktop Visual Acceptance (Step 3)", () => {
  test("1. Status Overview - Dark (1440x900 docked compact)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    await expect(page.locator(".desktop-sidebar-container")).toBeVisible();
    await expect(page.locator(".desktop-status-overview")).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, "status-overview-dark-1440x900.png") });
  });

  test("2. Status Overview - Light (1440x900 docked compact)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "light", viewport: { width: 1440, height: 900 } });

    await expect(page.locator(".desktop-sidebar-container")).toBeVisible();
    await expect(page.locator(".desktop-status-overview")).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, "status-overview-light-1440x900.png") });
  });

  test("3. Regional Status Overview - Dark (1440x900)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "regional-live");
    await prepareDesktopPage(page, { theme: "dark", network: "regional", viewport: { width: 1440, height: 900 } });

    await expect(page.locator(".desktop-sidebar-container")).toBeVisible();
    await page.screenshot({ path: join(SCREENSHOT_DIR, "status-overview-regional-dark-1440x900.png") });
  });

  test("4. Rich Impact Cards - Planned Closures (uniform 560px)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    await page.getByRole("button", { name: /Planned Closures/i }).click();
    const sidebar = page.locator(".desktop-sidebar-container");
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(560);
    await expect(page.getByRole("heading", { name: "Planned Closures" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "rich-impact-cards-closures-1440x900.png") });
  });

  test("5. Rich Impact Cards - Speed Zones (uniform 560px)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    await page.getByRole("button", { name: /^\d+\s*Reduced Speed Zones/i }).click();
    const sidebar = page.locator(".desktop-sidebar-container");
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(560);
    await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "rich-impact-cards-rsz-1440x900.png") });
  });

  test("6. Station Detail - Dark (uniform 560px)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    const station = page.getByRole("button", { name: "Stub Station station details" });
    await expect(station).toBeVisible();
    await station.dispatchEvent("click");

    const sidebar = page.locator(".desktop-sidebar-container");
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(560);
    await expect(page.locator(".station-detail-panel")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "station-detail-dark-1440x900.png") });
  });

  test("7. Search View - Dark (uniform 560px via global search)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    await page.locator(".desktop-sidebar-search-field").press("Enter");
    const sidebar = page.locator(".desktop-sidebar-container");
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(560);
    await expect(page.locator(".station-search-panel")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "search-view-dark-1440x900.png") });
  });

  test("8. Saved Commutes View - Dark", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    await page.locator('.desktop-rail-item[data-dest="commutes"]').click();
    await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "saved-commutes-dark-1440x900.png") });
  });

  test("9. More Panel - Dark (uniform 560px)", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1440, height: 900 } });

    await page.locator('.desktop-rail-item[data-dest="more"]').click();
    const sidebar = page.locator(".desktop-sidebar-container");
    const box = await sidebar.boundingBox();
    expect(box?.width).toBe(560);
    await expect(page.locator(".desktop-more-panel")).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "more-panel-dark-1440x900.png") });
  });

  test("10. Desktop Overlay - 1024x768 with exposed interactive map", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 1024, height: 768 } });

    await page.getByRole("button", { name: /Planned Closures/i }).click();
    const sidebar = page.locator(".desktop-sidebar-container");
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--overlay/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop-overlay-1024x768.png") });

    // Transient collapse via View on map
    const viewOnMapBtn = page.getByRole("button", { name: /View on map/i }).first();
    await viewOnMapBtn.click();
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--collapsed/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop-collapse-after-view-on-map-1024x768.png") });

    // Reopen sidebar
    const railToggle = page.locator(".desktop-rail-toggle");
    await railToggle.click();
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "desktop-reopened-1024x768.png") });
  });

  test("11. Mobile and responsive boundaries", async ({ page, request, isMobile }) => {
    test.skip(isMobile);
    await setStubMode(request, "seeded");

    // 767px mobile boundary
    await prepareDesktopPage(page, { theme: "dark", viewport: { width: 767, height: 800 } });
    await expect(page.locator(".desktop-nav-rail")).toBeHidden();
    await page.screenshot({ path: join(SCREENSHOT_DIR, "mobile-boundary-767px.png") });

    // 360px compact mobile
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "mobile-compact-360px.png") });

    // 640x360 short landscape
    await page.setViewportSize({ width: 640, height: 360 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "mobile-short-landscape-640x360.png") });
  });
});
