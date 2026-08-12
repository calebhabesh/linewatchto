import { expect, test } from "@playwright/test";

const stubUrl = "http://127.0.0.1:4174";

test("iPhone SE uses compact chrome and contained onboarding and status sheets", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "compact phone coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    window.localStorage.removeItem("linewatch-welcome-seen-v1");
    window.localStorage.removeItem("linewatch-unofficial-notice-ack-v1");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto("/");

  const welcome = page.getByRole("dialog", { name: "Welcome to LineWatchTO" });
  await expect(welcome).toBeVisible();
  const welcomeBounds = await welcome.boundingBox();
  expect(welcomeBounds).not.toBeNull();
  expect(welcomeBounds!.x).toBeGreaterThanOrEqual(9);
  expect(welcomeBounds!.y).toBeGreaterThanOrEqual(9);
  expect(welcomeBounds!.x + welcomeBounds!.width).toBeLessThanOrEqual(366);
  expect(welcomeBounds!.y + welcomeBounds!.height).toBeLessThanOrEqual(658);
  await expect(welcome.locator(".opening-welcome-image-frame--mobile").first()).toHaveCSS("aspect-ratio", "4 / 3");

  await welcome.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: "Got it" }).click();
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(nav).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--mobile-bottom-nav-height").trim()
  )).toBe("64px");
  await expect(page.locator(".rotate-map-btn")).toHaveCSS("width", "75px");
  await expect(page.locator(".rotate-map-btn")).toHaveCSS("height", "40px");
  await expect(page.locator(".rotate-map-btn span")).toHaveCSS("font-size", "8px");
  await expect(page.locator(".rotate-map-btn svg")).toHaveCSS("width", "24px");
  await expect(page.locator(".rotate-map-btn svg")).toHaveCSS("height", "24px");

  const centerMapButton = page.getByRole("button", { name: "Center map view" });
  await expect(centerMapButton).toHaveCSS("width", "60px");
  await expect(centerMapButton).toHaveCSS("height", "60px");
  await expect(centerMapButton.locator("svg")).toHaveCSS("width", "24px");
  await expect(centerMapButton.locator("span")).toHaveCSS("font-size", "9px");
  const mobileMapStage = page.locator(".ttc-map-stage");
  await centerMapButton.click();
  await expect(mobileMapStage).toHaveAttribute(
    "data-map-recenter-effect",
    "linewatch-ttc-map-recenter-fade",
  );
  await expect(mobileMapStage).toHaveCSS("transition-duration", "0s");
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute("data-map-camera-moving", "false");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");
  const regionalMap = page.locator(".regional-map");
  const regionalMapStage = regionalMap.locator(".regional-map-stage");
  const regionalMapVeil = regionalMap.locator(".regional-map-recenter-veil");
  await expect(regionalMap).toBeVisible();
  await page.getByRole("button", { name: "Center map view" }).click();
  await expect(regionalMapVeil).toHaveAttribute(
    "data-map-recenter-effect",
    "linewatch-regional-map-recenter-fade",
  );
  await expect(regionalMapStage).toHaveCSS("transition-duration", "0s");
  await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "TTC", exact: true })
    .click();
  const returnedTtcStage = page.locator(".ttc-map-stage");
  await expect(returnedTtcStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(returnedTtcStage).not.toHaveAttribute("data-map-recenter-effect");
  await expect(returnedTtcStage).toHaveCSS("opacity", "1");

  await page.getByRole("button", { name: "Status", exact: true }).click();
  const statusSheet = page.getByRole("region", { name: "Current service status" });
  await expect(statusSheet).toBeVisible();
  const sheetBounds = await statusSheet.boundingBox();
  const navBounds = await nav.boundingBox();
  expect(sheetBounds).not.toBeNull();
  expect(navBounds).not.toBeNull();
  expect(sheetBounds!.y).toBeGreaterThanOrEqual(0);
  expect(sheetBounds!.y + sheetBounds!.height).toBeLessThanOrEqual(navBounds!.y + 1);
  await expect(statusSheet.locator(".mobile-status-actions button").first()).toHaveCSS("min-height", "44px");

  await page.getByRole("button", { name: "Close status" }).click();
  const statusPeek = page.locator(".mobile-status-peek");
  const statusPeekBounds = await statusPeek.boundingBox();
  expect(statusPeekBounds).not.toBeNull();
  expect(statusPeekBounds!.x).toBeGreaterThanOrEqual(44);
  expect(statusPeekBounds!.x + statusPeekBounds!.width).toBeLessThanOrEqual(331);
});

test("Pixel 6a-sized portrait keeps the regular mobile scale", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile scale coverage runs in the touch-device project");

  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--mobile-bottom-nav-height").trim()
  )).toBe("74px");
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--mobile-top-action-button-size").trim()
  )).not.toBe("36px");
});

test("Pixel 6a back gesture history closes in-app sheets before leaving", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile browser-history coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await page.locator(".mobile-status-actions").getByRole("button", { name: /Delay/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "System Status" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("393px-wide phones receive the compact map-control sizing", async ({ page, isMobile }) => {
  test.skip(!isMobile, "compact phone coverage runs in the touch-device project");

  await page.setViewportSize({ width: 393, height: 727 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto("/");

  await expect(page.locator(".rotate-map-btn span")).toHaveCSS("font-size", "8px");
  await expect(page.locator(".rotate-map-btn svg")).toHaveCSS("width", "24px");
  await expect(page.getByRole("button", { name: "Center map view" }).locator("svg")).toHaveCSS("width", "24px");
});

test("iPhone SE keeps the subway closed card contained and actionable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "compact phone coverage runs in the touch-device project");

  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto("/?previewTime=2026-06-04T03:15:00-04:00");

  const closedCard = page.locator(".subway-closed-content");
  await expect(closedCard).toBeVisible();
  const bounds = await closedCard.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(7);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(660);
  await expect(closedCard.getByRole("button", { name: "Peek at Map" })).toBeVisible();
  await expect(closedCard).toHaveCSS("overflow-y", "auto");
});
