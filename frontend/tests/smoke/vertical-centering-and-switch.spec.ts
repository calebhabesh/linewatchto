import { expect, test } from "@playwright/test";

const disclaimerStorageKey = "linewatch-unofficial-notice-ack-v1";
const welcomeStorageKey = "linewatch-welcome-seen-v1";

test.describe("vertical centering and mode switch stability", () => {
  // Asset timing assertions must observe requests rather than worker cache hits.
  test.use({ serviceWorkers: "block" });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ disclaimerKey, welcomeKey }) => {
      window.localStorage.setItem(welcomeKey, "true");
      window.localStorage.setItem(disclaimerKey, "true");
      window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
    }, { disclaimerKey: disclaimerStorageKey, welcomeKey: welcomeStorageKey });
  });

  test("mobile preloads artwork and keeps shared controls live across network switches", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile project only");
    await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
    await expect(page.locator('.ttc-map-stage[data-raster-map-ready="true"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      performance.getEntriesByType("resource").filter((entry) =>
        entry.name.includes("regional-") && entry.name.includes("mobile.png")).length,
    )).toBe(3);
    const preloads = await page.evaluate(() =>
      performance.getEntriesByType("resource").filter((entry) =>
        entry.name.includes("ttc-") && entry.name.includes("mobile.png"))
        .map((entry) => ({
          name: entry.name,
          initiator: (entry as PerformanceResourceTiming).initiatorType,
          transferSize: (entry as PerformanceResourceTiming).transferSize,
        })));
    expect(preloads.slice(0, 3).map((entry) => entry.initiator)).toEqual(["link", "link", "link"]);
    expect(new Set(preloads.map((entry) => entry.name)).size).toBe(3);
    expect(preloads.slice(3).every((entry) => entry.transferSize === 0)).toBe(true);
    const controls = await page.locator("header .rotate-map-btn, header .theme-toggle-btn, .mobile-bottom-nav").elementHandles();
    await page.evaluate(() => {
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (...args) => {
        document.documentElement.dataset.unexpectedDocumentTransition = "true";
        return original(...args);
      };
    });
    const surface = page.locator(".network-map-transition-surface");
    for (const network of ["regional", "ttc", "regional", "ttc"]) {
      await page.locator(`.mobile-network-selector-slot .network-btn-${network}`).click();
      await expect.poll(() => surface.getAttribute("data-map-surface-transition"), { intervals: [16] }).toBe("entering");
      await expect(page.locator(`.${network}-map-stage[data-raster-map-ready="true"]`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.dataset.unexpectedDocumentTransition)).toBeUndefined();
      for (const control of controls) {
        expect(await control.evaluate((node) => node instanceof Element && node.isConnected && getComputedStyle(node).opacity === "1")).toBe(true);
      }
      await expect(surface).not.toHaveAttribute("data-map-surface-transition");
      // Stored layout commands must not replay Center after a network mount.
      await page.waitForTimeout(400);
      await expect(page.locator(".map-center-feedback")).toHaveCount(0);
    }
  });

  test("mobile waits for a slow regional map before starting its entrance", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile project only");
    let releaseAsset!: () => void;
    const assetGate = new Promise<void>((resolve) => { releaseAsset = resolve; });
    await page.route(/\/regional-rail-map\.svg/, async (route) => {
      await assetGate;
      await route.continue();
    });
    try {
      await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");
      await expect(page.locator('.ttc-map-stage[data-raster-map-ready="true"]')).toBeVisible();
      await page.locator(".mobile-network-selector-slot .network-btn-regional").click();
      const surface = page.locator(".network-map-transition-surface");
      await expect(surface).toHaveAttribute("data-map-surface-transition", "loading");
      await expect(page.getByRole("button", { name: "Rotate Map", exact: true })).toBeVisible();
      await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
      expect(await surface.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
      releaseAsset();
      await expect.poll(() => surface.getAttribute("data-map-surface-transition"), { intervals: [16] }).toBe("entering");
      await expect(page.locator('.regional-map-stage[data-raster-map-ready="true"]')).toBeVisible();
      await expect(surface).not.toHaveAttribute("data-map-surface-transition");
    } finally {
      releaseAsset();
    }
  });

  for (const closedLaunch of [false, true]) {
  test(`desktop TTC and Regional maps center between the top controls and alert badges (${closedLaunch ? "closed-screen peek" : "open launch"})`, async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop project only");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/?previewTime=2026-08-14T${closedLaunch ? "07" : "16"}:00:00.000Z`);
    if (closedLaunch) await page.getByRole("button", { name: "Peek at Map" }).click();

    const desktopCapsule = page.locator(".desktop-status-capsule");
    await expect(desktopCapsule).toBeVisible({ timeout: 15_000 });

    // -------------------------------------------------------------
    // 1. VERIFY TTC MAP VERTICAL CENTERING ON INITIAL LOAD
    // -------------------------------------------------------------
    const ttcStage = page.locator(".ttc-map-stage");
    await expect(ttcStage).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".map-control-rail")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".desktop-status-chip-row-container")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    const ttcInitialTransform = await ttcStage.evaluate((el) => el.style.transform);
    console.log("TTC INITIAL TRANSFORM:", ttcInitialTransform);

    const ttcMetrics = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(".ttc-map-stage");
      const rail = document.querySelector<HTMLElement>(".map-control-rail");
      const badges = document.querySelector<HTMLElement>(".desktop-status-chip-row-container");

      const railBottom = rail?.getBoundingClientRect().bottom ?? 0;
      const badgesTop = badges?.getBoundingClientRect().top ?? 0;

      const tf = stage?.style.transform ?? "";
      const match = tf.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
      if (!match) return { diff: 999, paddingAbove: 0, paddingBelow: 0 };
      const ty = parseFloat(match[2]);
      const scale = parseFloat(match[3]);

      // TTC_MAP_CONTENT_BOUNDS: y: 120 * (4500/8250) = 65.45, height: (3840 - 120) * (4500/8250) = 2029.09
      const topArt = ty + (120 * (4500 / 8250)) * scale;
      const bottomArt = ty + (3840 * (4500 / 8250)) * scale;

      const paddingAbove = topArt - railBottom;
      const paddingBelow = badgesTop - bottomArt;

      return {
        railBottom,
        badgesTop,
        topArt,
        bottomArt,
        paddingAbove,
        paddingBelow,
        diff: Math.abs(paddingAbove - paddingBelow),
      };
    });

    console.log("TTC VERTICAL METRICS:", ttcMetrics);
    expect(ttcMetrics.paddingAbove).toBeGreaterThanOrEqual(-1);
    expect(ttcMetrics.paddingBelow).toBeGreaterThanOrEqual(-1);
    // Vertical padding between the top controls and alert badges should be balanced
    expect(ttcMetrics.diff).toBeLessThan(2.0);



    // -------------------------------------------------------------
    // 2. SWITCH TO REGIONAL AND VERIFY VERTICAL CENTERING
    // -------------------------------------------------------------
    const regionalBtn = desktopCapsule.locator(".network-btn-regional");
    await regionalBtn.click();

    const regionalStage = page.locator(".regional-map-stage");
    await expect(regionalStage).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".regional-station-hit-target[data-regional-station-id='allandale-waterfront']")).toBeAttached({ timeout: 10_000 });
    await expect(page.locator(".regional-station-hit-target[data-regional-station-id='hamilton']")).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    const regionalInitialTransform = await regionalStage.evaluate((el) => el.style.transform);
    console.log("REGIONAL AFTER SWITCH TRANSFORM:", regionalInitialTransform);

    const regionalMetrics = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(".regional-map-stage");
      const capsule = document.querySelector<HTMLElement>(".desktop-status-capsule");
      const badges = document.querySelector<HTMLElement>(".desktop-status-chip-row-container");

      const consoleBottom = capsule?.getBoundingClientRect().bottom ?? 0;
      const badgesTop = badges?.getBoundingClientRect().top ?? 0;

      const tf = stage?.style.transform ?? "";
      const match = tf.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/);
      if (!match) return { diff: 999, paddingAbove: 0, paddingBelow: 0 };
      const ty = parseFloat(match[2]);
      const scale = parseFloat(match[3]);

      // REGIONAL_MAP_CONTENT_BOUNDS: y: 110.78, height: 2395.26
      const topArt = ty + 110.78 * scale;
      const bottomArt = ty + (110.78 + 2395.26) * scale;

      const paddingAbove = topArt - consoleBottom;
      const paddingBelow = badgesTop - bottomArt;

      return {
        consoleBottom,
        badgesTop,
        topArt,
        bottomArt,
        paddingAbove,
        paddingBelow,
        diff: Math.abs(paddingAbove - paddingBelow),
      };
    });

    console.log("REGIONAL VERTICAL METRICS:", regionalMetrics);
    expect(regionalMetrics.paddingAbove).toBeGreaterThan(15);
    expect(regionalMetrics.paddingBelow).toBeGreaterThan(15);
    // Regional vertical padding between the console and alert badges should be balanced
    expect(regionalMetrics.diff).toBeLessThan(2.0);



    // -------------------------------------------------------------
    // 3. VERIFY STABILITY ACROSS MAP MODE SWITCHES (NO SHIFT)
    // -------------------------------------------------------------
    // Regional Center button check
    const regionalCenterBtn = page.locator(".regional-map-control-rail .map-control-button").first();
    await regionalCenterBtn.click();
    await page.waitForTimeout(400);
    const regionalAfterCenter = await regionalStage.evaluate((el) => el.style.transform);
    expect(regionalAfterCenter).toBe(regionalInitialTransform);

    // Switch back to TTC
    const ttcBtn = desktopCapsule.locator(".network-btn-ttc");
    await ttcBtn.click();
    await expect(ttcStage).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    const ttcAfterRoundTrip = await ttcStage.evaluate((el) => el.style.transform);
    console.log("TTC AFTER ROUND TRIP TRANSFORM:", ttcAfterRoundTrip);
    expect(ttcAfterRoundTrip).toBe(ttcInitialTransform);

    // TTC Center button check
    const ttcCenterBtn = page.locator(".map-control-rail .map-control-button").first();
    await ttcCenterBtn.click();
    await page.waitForTimeout(400);
    const ttcAfterCenter = await ttcStage.evaluate((el) => el.style.transform);
    expect(ttcAfterCenter).toBe(ttcInitialTransform);

    // Switch back to Regional
    await regionalBtn.click();
    await expect(regionalStage).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1000);

    const regionalSecondSwitchTransform = await regionalStage.evaluate((el) => el.style.transform);
    console.log("REGIONAL SECOND SWITCH TRANSFORM:", regionalSecondSwitchTransform);
    expect(regionalSecondSwitchTransform).toBe(regionalInitialTransform);
  });
  }
});
