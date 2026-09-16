import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.describe("Desktop Adaptive Profiles, Layout Budgets, and Transient Collapse", () => {
  test.beforeEach(async ({ page }) => {
    await installDismissedTransientUi(page);
  });

  test("applies wide profile (680px), docks at 1440px, overlays at 1024px, and transiently collapses on View on map", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar layout tests apply only to desktop");
    await setStubMode(request, "seeded");

    // 1. Check docked mode at 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    // Initial status overview is compact (380px)
    await expect(sidebar).toHaveAttribute("data-profile", "compact");
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--docked/);
    const compactBox = await sidebar.boundingBox();
    expect(compactBox?.width).toBe(380);

    // Open Delays panel (wide profile, 680px)
    await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
    await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-profile", "wide");
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--docked/);
    const wideBox1440 = await sidebar.boundingBox();
    expect(wideBox1440?.width).toBe(680);

    // In docked mode, clicking "View on map" leaves detail open beside the map
    const viewOnMapBtn = page.getByRole("button", { name: /View on map/i }).first();
    await viewOnMapBtn.click();
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
    await expect(sidebar).toBeVisible();

    // 2. Switch to 1024x768 viewport (below wide dock threshold of 1232px -> overlay mode)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);

    await expect(sidebar).toHaveClass(/desktop-sidebar-container--overlay/);
    await expect(sidebar).toHaveAttribute("data-profile", "wide");
    const wideBox1024 = await sidebar.boundingBox();
    expect(wideBox1024?.width).toBe(680);

    // In overlay mode, clicking "View on map" transiently collapses the sidebar
    // to reveal the target on the map
    await viewOnMapBtn.click();

    // Sidebar is now collapsed
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--collapsed/);

    // Durable preference in localStorage was NOT changed to "true"
    const durablePreference = await page.evaluate(() => {
      return window.localStorage.getItem("linewatch-desktop-sidebar-collapsed");
    });
    expect(durablePreference).not.toBe("true");

    // Focus is resolved to the stable rail toggle button
    const toggleBtn = page.getByRole("button", { name: "Expand sidebar" });
    await expect(toggleBtn).toBeFocused();

    // Reopening the sidebar via rail restores the Delays panel with the active selection
    await toggleBtn.click();
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
    await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
    await expect(page.locator('[data-impact-card-id="stub-delay-st-george-curve"]')).toHaveClass(/is-active/);
  });

  test("applies medium profile (560px) for station detail and restores compact on close", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar layout tests apply only to desktop");
    await setStubMode(request, "seeded");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    await expect(sidebar).toHaveAttribute("data-profile", "compact");

    // Open station details (Union)
    const search = page.getByRole("searchbox", { name: "Station Search" });
    await search.click();
    await search.fill("Union");
    await page.getByRole("button", { name: "Union TTC station search result" }).click();
    await expect(page.locator(".station-detail-panel")).toBeVisible();

    // Station detail resolves to medium (560px)
    await expect(sidebar).toHaveAttribute("data-profile", "medium");
    const stationBox = await sidebar.boundingBox();
    expect(stationBox?.width).toBe(560);

    // Close station details -> restores compact (380px)
    const closeBtn = page.getByRole("button", { name: "Close station details" });
    await closeBtn.click();
    await expect(page.locator(".station-detail-panel")).not.toBeVisible();
    await expect(sidebar).toHaveAttribute("data-profile", "compact");
    const restoredBox = await sidebar.boundingBox();
    expect(restoredBox?.width).toBe(380);
  });

  test("preserves camera and layout across TTC and GO/UP networks", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar layout tests apply only to desktop");
    await setStubMode(request, "seeded");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    // Switch to GO/UP
    await page.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    await expect(sidebar).toHaveAttribute("data-profile", "compact");

    // Open regional station detail (Oakville)
    const search = page.getByRole("searchbox", { name: "Station Search" });
    await search.click();
    await search.fill("Oakville");
    await page.getByRole("button", { name: "Oakville GO and UP station search result" }).click();
    await expect(page.locator(".regional-station-detail")).toBeVisible();

    // Medium profile (560px) applied
    await expect(sidebar).toHaveAttribute("data-profile", "medium");
    const regionalStationBox = await sidebar.boundingBox();
    expect(regionalStationBox?.width).toBe(560);

    // Switch back to TTC
    await page.getByRole("button", { name: "TTC", exact: true }).click();
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
    await expect(sidebar).toHaveAttribute("data-profile", "compact");
  });
});
