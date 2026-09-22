import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.describe("Desktop Adaptive Profiles, Layout Budgets, and Transient Collapse", () => {
  test.beforeEach(async ({ page }) => {
    await installDismissedTransientUi(page);
  });

  test("applies destination-based width, docks at 1440px, overlays at 1024px, and transiently collapses on View on map", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar layout tests apply only to desktop");
    await setStubMode(request, "seeded");

    // 1. Check docked mode at 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    // Initial status overview targets 380px
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--docked/);
    const initialBox = await sidebar.boundingBox();
    expect(initialBox?.width).toBe(380);

    // Open Delays panel (still 560px detail width)
    await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
    await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--docked/);
    await expect(sidebar).toHaveCSS("width", "560px");
    const delaysBox1440 = await sidebar.boundingBox();
    expect(delaysBox1440?.width).toBe(560);

    // In docked mode, clicking "View on map" leaves detail open beside the map
    const viewOnMapBtn = page.getByRole("button", { name: /^View .* on map$/i }).first();
    await viewOnMapBtn.click();
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
    await expect(sidebar).toBeVisible();

    // 2. Switch to 1024x768 viewport (below dock threshold of 1120px -> overlay mode)
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);

    await expect(sidebar).toHaveClass(/desktop-sidebar-container--overlay/);
    const overlayBox1024 = await sidebar.boundingBox();
    expect(overlayBox1024?.width).toBe(560);

    // In overlay mode, clicking "View on map" transiently collapses the sidebar
    // to reveal the target on the map
    await viewOnMapBtn.click();

    // Sidebar is now collapsed
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--collapsed/);

    // Automatic collapse is transient and does not replace the visitor's preference.
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
    await expect(page.locator(".alert-card.is-active")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Back:/i })).toBeVisible();
    expect(await page.evaluate(() => (
      window.localStorage.getItem("linewatch-desktop-sidebar-collapsed")
    ))).toBeNull();
  });

  test("preserves destination-based width for station detail and restores on close", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar layout tests apply only to desktop");
    await setStubMode(request, "seeded");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    const initialBox = await sidebar.boundingBox();
    expect(initialBox?.width).toBe(380);

    // Open station details (Union)
    const search = page.getByRole("searchbox", { name: "Station Search" });
    await search.click();
    await search.fill("Union");
    await page.getByRole("button", { name: "Union TTC station search result" }).click();
    await expect(page.locator(".station-detail-panel")).toBeVisible();

    // Station detail remains 560px detail width
    const stationBox = await sidebar.boundingBox();
    expect(stationBox?.width).toBe(560);

    // Close station details -> restores compact Status width
    const closeBtn = page.getByRole("button", { name: "Close station details" });
    await closeBtn.click();
    await expect(page.locator(".station-detail-panel")).not.toBeVisible();
    await expect(page.locator(".desktop-view-content-wrapper")).toHaveAttribute("data-nav-direction", "back");
    await expect(sidebar).toHaveCSS("width", "380px");
    const restoredBox = await sidebar.boundingBox();
    expect(restoredBox?.width).toBe(380);
  });

  test("animates collapse, expansion, destination width, and directional page navigation", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar motion applies only to desktop");
    await setStubMode(request, "seeded");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    const toggle = page.getByRole("button", { name: "Collapse sidebar" });
    await toggle.click();
    expect(await sidebar.evaluate((element) => element.getAnimations().some((animation) =>
      animation instanceof CSSTransition && animation.transitionProperty === "width"
    ))).toBe(true);
    await expect(sidebar).toHaveCSS("width", "0px");
    await expect(sidebar).toHaveAttribute("inert", "");

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    expect(await sidebar.evaluate((element) => element.getAnimations().some((animation) =>
      animation instanceof CSSTransition && animation.transitionProperty === "width"
    ))).toBe(true);
    await expect(sidebar).toHaveCSS("width", "380px");
    await expect(sidebar).not.toHaveAttribute("inert", "");

    await page.locator('[data-dest="more"]').click();
    await expect(page.locator(".desktop-view-content-wrapper")).toHaveAttribute("data-nav-direction", "root");
    await page.getByRole("button", { name: "Privacy & Acknowledgements" }).click();
    const forwardView = page.locator('.desktop-view-content-wrapper[data-nav-direction="forward"]');
    await expect(forwardView).toBeVisible();
    await expect(forwardView).toHaveCSS("animation-name", "panel-container-forward");

    await page.getByRole("button", { name: "Back to menu" }).click();
    const backView = page.locator('.desktop-view-content-wrapper[data-nav-direction="back"]');
    await expect(backView).toBeVisible();
    await expect(backView).toHaveCSS("animation-name", "panel-container-back");

    await page.locator('[data-dest="source-status"]').click();
    expect(await sidebar.evaluate((element) => element.getAnimations().some((animation) =>
      animation instanceof CSSTransition && animation.transitionProperty === "width"
    ))).toBe(true);
    await expect(sidebar).toHaveCSS("width", "560px");
  });

  test("preserves destination-based width across TTC and GO/UP networks", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar layout tests apply only to desktop");
    await setStubMode(request, "seeded");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

    const sidebar = page.locator("#desktop-sidebar-container");
    const ttcBox = await sidebar.boundingBox();
    expect(ttcBox?.width).toBe(380);

    // Switch to GO/UP
    await sidebar.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
    const goUpBox = await sidebar.boundingBox();
    expect(goUpBox?.width).toBe(380);

    // Open regional station detail (Oakville)
    const search = page.getByRole("searchbox", { name: "Station Search" });
    await search.click();
    await search.fill("Oakville");
    await page.getByRole("button", { name: "Oakville GO and UP station search result" }).click();
    await expect(page.locator(".regional-station-detail")).toBeVisible();

    // Regional station detail remains 560px detail width
    await expect(sidebar).toHaveCSS("width", "560px");
    const regionalStationBox = await sidebar.boundingBox();
    expect(regionalStationBox?.width).toBe(560);

    // Switch back to TTC
    await page.locator('[data-dest="status"]').click();
    await sidebar.getByRole("button", { name: "TTC", exact: true }).click();
    await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
    const finalTtcBox = await sidebar.boundingBox();
    expect(finalTtcBox?.width).toBe(380);
  });

  test("keeps each desktop camera stable through sidebar changes and network switches", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop camera persistence applies only to desktop");
    await setStubMode(request, "seeded");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const sidebar = page.locator("#desktop-sidebar-container");
    const workspace = page.locator(".desktop-map-workspace");
    const ttcViewport = page.locator("[data-map-pan-zoom-viewport]");
    const ttcStage = page.locator(".ttc-map-stage");
    await expect(ttcStage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(ttcViewport).toHaveAttribute("data-map-camera-moving", "false");

    const workspaceBefore = await workspace.boundingBox();
    const ttcDefaultCamera = await ttcStage.evaluate((element) => (element as HTMLElement).style.transform);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => ttcStage.evaluate((element) => (
      (element as HTMLElement).style.transform
    ))).not.toBe(ttcDefaultCamera);
    await expect(ttcViewport).toHaveAttribute("data-map-camera-moving", "false");
    const ttcCamera = await ttcStage.evaluate((element) => (element as HTMLElement).style.transform);

    await page.locator('[data-dest="source-status"]').click();
    await expect(sidebar).toHaveCSS("width", "560px");
    expect(await workspace.boundingBox()).toEqual(workspaceBefore);
    expect(await ttcStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(ttcCamera);

    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--collapsed/);
    expect(await ttcStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(ttcCamera);
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
    expect(await ttcStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(ttcCamera);

    await page.locator('[data-dest="status"]').click();
    await sidebar.getByRole("button", { name: "GO/UP", exact: true }).click();
    const regionalMap = page.locator(".regional-map");
    const regionalStage = page.locator(".regional-map-stage");
    await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");
    const regionalDefaultCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => regionalStage.evaluate((element) => (
      (element as HTMLElement).style.transform
    ))).not.toBe(regionalDefaultCamera);
    await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");
    const regionalCamera = await regionalStage.evaluate((element) => (element as HTMLElement).style.transform);

    await sidebar.getByRole("button", { name: "TTC", exact: true }).click();
    await expect(ttcStage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(ttcViewport).toHaveAttribute("data-map-camera-moving", "false");
    expect(await ttcStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(ttcCamera);

    await sidebar.getByRole("button", { name: "GO/UP", exact: true }).click();
    await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");
    expect(await regionalStage.evaluate((element) => (element as HTMLElement).style.transform)).toBe(regionalCamera);
  });

  test("starts expanded on every desktop visit and ignores retired saved collapse state", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar startup applies only to desktop");
    await setStubMode(request, "seeded");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      window.localStorage.setItem("linewatch-desktop-sidebar-collapsed", "true");
    });
    await page.goto("/");

    const sidebar = page.locator("#desktop-sidebar-container");
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
    await expect.poll(() => page.evaluate(() => (
      window.localStorage.getItem("linewatch-desktop-sidebar-collapsed")
    ))).toBeNull();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveClass(/desktop-sidebar-container--collapsed/);

    await page.reload();
    await expect(sidebar).not.toHaveClass(/desktop-sidebar-container--collapsed/);
  });
});


test("compact views fit docking boundaries and preserve mobile layout", async ({ page, request }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const sidebar = page.locator("#desktop-sidebar-container");
  for (const dest of ["more", "status"]) {
    await page.locator(`[data-dest="${dest}"]`).click();
    await expect(sidebar).toHaveCSS("width", "380px");
  }
  await page.locator('[data-dest="source-status"]').click();
  await expect(sidebar).toHaveCSS("width", "560px");
  await page.locator('[data-dest="status"]').click();
  await expect(sidebar).toHaveCSS("width", "380px");
  for (const width of [939, 940, 767, 768, 360]) {
    await page.setViewportSize({ width, height: 900 });
    if (width >= 768) {
      await expect(sidebar).toHaveCSS("width", "380px");
      await expect(sidebar).toHaveClass(width >= 940 ? /--docked/ : /--overlay/);
    } else {
      await expect(sidebar).not.toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("desktop rail exposes network-specific impact shortcuts above the data divider", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "Desktop navigation rail applies only to desktop");
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const shortcuts = page.locator(".desktop-rail-alert-shortcuts .desktop-rail-alert-shortcut");
  await expect(shortcuts).toHaveCount(4);
  await expect.poll(() => shortcuts.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-alert-kind")))).toEqual([
    "alerts",
    "delays",
    "reduced-speed-zones",
    "closures",
  ]);
  await expect(page.locator('[data-dest="alerts"]')).toContainText("ActiveAlerts");
  await expect(page.locator('[data-dest="reduced-speed-zones"]')).toContainText("ReducedSpeedZones");

  const shortcutBottom = await page.locator(".desktop-rail-alert-shortcuts").evaluate((element) => element.getBoundingClientRect().bottom);
  const dividerTop = await page.locator(".desktop-rail-divider").last().evaluate((element) => element.getBoundingClientRect().top);
  expect(shortcutBottom).toBeLessThanOrEqual(dividerTop);

  await page.locator('[data-dest="delays"]').click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect(page.locator('[data-dest="delays"]')).toHaveAttribute("data-active", "true");

  await page.locator('[data-dest="status"]').click();
  await page.locator("#desktop-sidebar-container").getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect.poll(() => shortcuts.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-alert-kind")))).toEqual([
    "alerts",
    "delays",
    "trip-changes",
    "closures",
  ]);

  await page.setViewportSize({ width: 1024, height: 600 });
  const railItems = page.locator(".desktop-rail-items");
  await expect.poll(() => railItems.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.locator('[data-dest="trip-changes"]').click();
  await expect(page.locator('[data-dest="trip-changes"]')).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole("group", { name: "GO / UP notice content" })
      .getByRole("button", { name: "Trip Changes", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
