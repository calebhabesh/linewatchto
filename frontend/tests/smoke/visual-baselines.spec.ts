import { expect, test, type Page } from "@playwright/test";
import { appUrl, setStubMode } from "./test-support";

type PrepareOptions = {
  theme?: "dark" | "light";
  highContrast?: boolean;
  network?: "ttc" | "regional";
  previewTime?: string;
  viewport?: { width: number; height: number };
};

async function prepareVisualBaselinePage(page: Page, options: PrepareOptions = {}) {
  const theme = options.theme ?? "dark";
  const highContrast = Boolean(options.highContrast);
  const network = options.network ?? "ttc";
  const previewTime = options.previewTime ?? "2026-08-14T16:00:00.000Z";

  if (options.viewport) {
    await page.setViewportSize(options.viewport);
  }

  await page.clock.setFixedTime(previewTime);

  await page.emulateMedia({
    reducedMotion: "reduce",
    colorScheme: theme,
  });

  const cookieValue = encodeURIComponent(
    JSON.stringify({
      theme,
      highContrast,
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
    ({ themeValue, highContrastValue, networkValue }) => {
      window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
      window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
      window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", "1700000000000");
      window.localStorage.setItem("linewatch-seen-release-notes-version", "1.0.0");
      window.localStorage.setItem("linewatch-reduced-motion-enabled-v1", "true");
      window.localStorage.setItem("linewatch-dot-background-enabled-v1", "false");
      window.localStorage.setItem("linewatch-estimated-trains-enabled-v1", "false");
      window.localStorage.setItem("linewatch-theme-v1", themeValue);
      window.localStorage.setItem("linewatch-high-contrast-enabled-v1", highContrastValue ? "true" : "false");
      window.localStorage.setItem("linewatch-default-network-v1", networkValue);
    },
    {
      themeValue: theme,
      highContrastValue: highContrast,
      networkValue: network,
    },
  );

  await page.goto(`${appUrl}/?previewTime=${encodeURIComponent(previewTime)}`);

  // Freeze all CSS animations, transitions, and carets for deterministic screenshots
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

  // Wait for all web fonts to load
  await page.evaluate(() => document.fonts.ready);

  // Wait for map readiness
  const mapStage = network === "regional"
    ? page.locator(".regional-map-stage")
    : page.locator(".ttc-map-stage");
  await expect(mapStage).toHaveAttribute("data-raster-map-ready", "true");

  // Allow settled layout
  await page.waitForTimeout(200);
}

test.describe("Visual Regression Baselines", () => {
  test("TTC desktop map, light", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "light",
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
    await expect(page.locator(".ttc-svg-container")).toBeVisible();
    await expect(page).toHaveScreenshot("ttc-desktop-map-light.png");
  });

  test("TTC desktop map, dark", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
    await expect(page.locator(".ttc-svg-container")).toBeVisible();
    await expect(page).toHaveScreenshot("ttc-desktop-map-dark.png");
  });

  test("GO/UP desktop map", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "regional-live");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "regional",
      viewport: { width: 1280, height: 800 },
    });

    await expect(page.getByRole("button", { name: "Fit regional network" })).toBeVisible();
    await expect(page.locator(".regional-map-stage")).toBeVisible();
    await expect(page).toHaveScreenshot("regional-desktop-map.png");
  });

  test("TTC mobile portrait", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "mobile-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
    });

    await expect(page.locator(".mobile-status-peek")).toBeVisible();
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await expect(page).toHaveScreenshot("ttc-mobile-portrait.png");
  });

  test("compact or short mobile viewport", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "mobile-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
      viewport: { width: 375, height: 667 },
    });

    await expect(page.locator(".mobile-status-peek")).toBeVisible();
    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await expect(page).toHaveScreenshot("compact-mobile-viewport.png");
  });

  test("high-contrast panel state", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      highContrast: true,
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: /Active Alerts/i }).click();
    await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
    await expect(page).toHaveScreenshot("high-contrast-panel-state.png");
  });

  test("current-status or alerts panel", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      highContrast: false,
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: /Active Alerts/i }).click();
    await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
    await expect(page).toHaveScreenshot("current-status-alerts-panel.png");
  });

  test("station detail", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    const stubStation = page.getByRole("button", { name: "Stub Station station details" });
    await expect(stubStation).toBeVisible();
    await stubStation.dispatchEvent("click");
    const panel = page.getByRole("complementary", { name: "Stub Station station details" });
    await expect(panel).toBeVisible();
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot("station-detail-panel.png");
  });

  test("My Commutes", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name: "My Commutes" }).click({ force: true });
    await expect(page.getByRole("heading", { name: "My Commutes" })).toBeVisible();
    await expect(page).toHaveScreenshot("my-commutes-panel.png");
  });

  test("selected/overlapping map impact", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "desktop-only visual baseline");
    await setStubMode(request, "map-authoritative-overlap");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
      viewport: { width: 1280, height: 800 },
    });

    const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]').first();
    await expect(overlapMarker).toBeVisible();
    await overlapMarker.dispatchEvent("click");
    const overlapChooser = page.locator("[data-overlap-chooser]");
    await expect(overlapChooser).toBeVisible();
    await expect(page).toHaveScreenshot("selected-overlapping-map-impact.png");
  });

  test("mobile Status or More sheet", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "mobile-only visual baseline");
    await setStubMode(request, "seeded");
    await prepareVisualBaselinePage(page, {
      theme: "dark",
      network: "ttc",
    });

    await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await expect(page.locator(".mobile-status-sheet")).toBeVisible();
    await expect(page).toHaveScreenshot("mobile-status-sheet.png");
  });
});
