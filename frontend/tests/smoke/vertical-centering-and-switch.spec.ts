import { expect, test } from "@playwright/test";

const disclaimerStorageKey = "linewatch-unofficial-notice-ack-v1";
const welcomeStorageKey = "linewatch-welcome-seen-v1";

test.describe("vertical centering and mode switch stability", () => {
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
    const rotate = await page.getByRole("button", { name: "Rotate map", exact: true }).elementHandle();
    for (const network of ["regional", "ttc"]) {
      await page.locator(`.mobile-network-selector-slot .network-btn-${network}`).click();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.dataset.networkTransitionDirection ?? "")).not.toBe("");
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).viewTransitionName)).toBe("none");
      expect(await rotate?.evaluate((node) => node.isConnected)).toBe(true);
      await expect(page.locator(`.${network === "regional" ? "regional" : "ttc"}-map-stage[data-raster-map-ready="true"]`)).toBeVisible();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.dataset.networkTransitionDirection ?? "")).toBe("");
    }
  });

  test("desktop TTC and Regional maps are vertically centered between their top console and bottom badges, and stay centered across switches", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop project only");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?previewTime=2026-08-14T16:00:00.000Z");

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
    // Vertical padding above the console and below to badges should be balanced
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
    // Regional vertical padding above the console and below to badges should be balanced
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
});
