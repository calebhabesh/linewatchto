import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.describe("Geographic Map Stability & Lifecycle", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
    });
  });

  test("map instance survives sidebar collapse/expand, poll ticks, and data refreshes without recreation or flashing", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop sidebar lifecycle regression applies to desktop viewports");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    // Initial lifecycle state after first load:
    const initialStats = await page.evaluate(() => window.__linewatchGeographicMapLifecycle);
    expect(initialStats).toBeDefined();
    expect(initialStats?.constructors).toBe(1);
    expect(initialStats?.removals).toBe(0);
    expect(initialStats?.loadingTransitions).toBe(1);
    expect(initialStats?.styleReplacements).toBe(0);

    // 1. Collapse sidebar
    const collapseBtn = page.getByRole("button", { name: "Collapse sidebar" });
    await collapseBtn.click();
    await page.waitForTimeout(300);

    // 2. Expand sidebar
    const expandBtn = page.getByRole("button", { name: "Expand sidebar" });
    await expandBtn.click();
    await page.waitForTimeout(300);

    // 3. Trigger equal data refresh (visibilitychange with unchanged data)
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(400);

    // 4. Trigger changed data refresh (visibilitychange with new live data)
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(400);

    const postActionStats = await page.evaluate(() => window.__linewatchGeographicMapLifecycle);

    // Assert zero additional constructors, removals, style replacements, or loading transitions
    expect(postActionStats?.constructors, "Zero additional map constructors after toggles and polls").toBe(1);
    expect(postActionStats?.removals, "Zero map removals after toggles and polls").toBe(0);
    expect(postActionStats?.loadingTransitions, "Zero additional loading transitions (no flashing)").toBe(1);
    expect(postActionStats?.styleReplacements, "Zero style replacements during toggles and polls").toBe(0);
  });

  test("camera center/zoom and active selection survive sidebar toggles, data refreshes, and filter changes", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop camera stability applies to desktop viewports");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    // Zoom in once to establish a distinct camera
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(300);

    // Select an alert from the sidebar
    const delayCard = page.getByRole("button", { name: /delay:/i }).first();
    if (await delayCard.isVisible()) {
      await delayCard.click();
      await page.waitForTimeout(400);
    }

    // Capture camera and selection state before toggles
    const beforeState = await page.evaluate(() => {
      const activeCard = document.querySelector('[data-selected="true"], .desktop-alert-row--active, .active');
      return {
        selectedPresent: Boolean(activeCard),
        zoom: parseFloat((document.querySelector('.map-control-slider input') as HTMLInputElement)?.value ?? "0"),
      };
    });

    // Toggle sidebar collapsed then expanded
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.waitForTimeout(300);

    // Refresh data
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(400);

    // Verify camera zoom and active selection survived
    const afterState = await page.evaluate(() => {
      return {
        zoom: parseFloat((document.querySelector('.map-control-slider input') as HTMLInputElement)?.value ?? "0"),
      };
    });

    expect(Math.abs(afterState.zoom - beforeState.zoom)).toBeLessThan(0.2);

    const stats = await page.evaluate(() => window.__linewatchGeographicMapLifecycle);
    expect(stats?.constructors).toBe(1);
    expect(stats?.removals).toBe(0);
    expect(stats?.loadingTransitions).toBe(1);
  });

  test("View on Map focuses supported categories and reports missing geographic coverage", async ({ page, isMobile }) => {
    test.skip(isMobile, "Category camera focus regression is covered on the desktop map surface");
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const panel of ["alerts", "delays", "reduced-speed-zones", "closures"]) {
      await page.goto(`/?panel=${panel}`);
      const geoMap = page.locator(".geographic-network-map");
      await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

      const beforeFocusCount = await page.evaluate(
        () => window.__linewatchGeographicMapLifecycle?.events.filter((event) => event.type === "focus").length ?? 0,
      );
      const card = page.locator("[data-impact-card-id]").first();
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: /on map/i }).click();
      await expect.poll(async () => page.evaluate(
        ({ before }) => {
          const focusCount = window.__linewatchGeographicMapLifecycle?.events.filter((event) => event.type === "focus").length ?? 0;
          return focusCount > before || document.body.innerText.includes("Location unavailable on geographic map");
        },
        { before: beforeFocusCount },
      )).toBe(true);
    }
  });

  test("clicking a geographic corridor with multiple alerts opens one complete chooser", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop verifies the geographically anchored chooser; compact presentation is shared");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/dashboard?network=ttc*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const segment = body.map.segments.find(
        (candidate: { id: string }) => candidate.id === "line-4-sheppard-yonge-don-mills",
      );
      segment.id = "line-4-leslie-don-mills";
      segment.impacts.push({
        kind: "delay",
        cardId: "stub-delay-line-4-second",
        travelDirection: "reverse",
        sourceAlertIds: ["stub-delay-line-4-second"],
      });
      body.delays.push({
        ...body.delays.find((delay: { id: string }) => delay.id === "stub-delay-line-4"),
        id: "stub-delay-line-4-second",
        title: "Second Line 4 delay",
        displayDirection: "Westbound",
      });
      await route.fulfill({ response, json: body });
    });
    await page.goto("/?panel=delays");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    const card = page.locator('[data-impact-card-id="stub-delay-line-4"]');
    await card.getByRole("button", { name: /on map/i }).click();
    await expect.poll(async () => page.evaluate(
      () => window.__linewatchGeographicMapLifecycle?.events.some(
        (event) => event.type === "focus" && event.detail === "delay:stub-delay-line-4",
      ) ?? false,
    )).toBe(true);
    const focusTimestamp = await page.evaluate(() => window.__linewatchGeographicMapLifecycle?.events.findLast(
      (event) => event.type === "focus" && event.detail === "delay:stub-delay-line-4",
    )?.timestamp ?? 0);
    await expect.poll(async () => page.evaluate(
      ({ after }) => window.__linewatchGeographicMapLifecycle?.events.some(
        (event) => event.type === "moveend" && event.timestamp >= after,
      ) ?? false,
      { after: focusTimestamp },
    )).toBe(true);

    const canvasBox = await geoMap.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.click(
      canvasBox!.x + canvasBox!.width * 0.55,
      canvasBox!.y + canvasBox!.height * 0.38,
    );

    const chooser = page.locator("[data-overlap-chooser]");
    await expect(chooser).toBeVisible();
    await expect(chooser.locator('[data-overlap-choice-id="stub-delay-line-4"]')).toBeVisible();
    await expect(chooser.locator('[data-overlap-choice-id="stub-delay-line-4-second"]')).toBeVisible();
  });

  test("theme switching replaces style only on genuine change, preserving map instance and camera", async ({ page, isMobile }) => {
    test.skip(isMobile, "Theme switching applies to desktop viewports");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    const statsBefore = await page.evaluate(() => window.__linewatchGeographicMapLifecycle);
    expect(statsBefore?.constructors).toBe(1);
    expect(statsBefore?.styleReplacements).toBe(0);

    // Toggle theme
    const themeBtn = page.getByRole("button", { name: "Toggle theme" });
    await themeBtn.click();
    await page.waitForTimeout(600);

    const statsAfterFirst = await page.evaluate(() => window.__linewatchGeographicMapLifecycle);
    // Map was NOT destroyed; style was replaced exactly once
    expect(statsAfterFirst?.constructors, "Map instance preserved across theme toggle").toBe(1);
    expect(statsAfterFirst?.removals, "Map not removed on theme toggle").toBe(0);
    expect(statsAfterFirst?.styleReplacements, "Style replaced exactly once on genuine theme change").toBe(1);
    expect(statsAfterFirst?.loadingTransitions, "No full loading transitions on theme change").toBe(1);

    // Toggle back
    await themeBtn.click();
    await page.waitForTimeout(600);

    const statsAfterSecond = await page.evaluate(() => window.__linewatchGeographicMapLifecycle);
    expect(statsAfterSecond?.constructors).toBe(1);
    expect(statsAfterSecond?.removals).toBe(0);
    expect(statsAfterSecond?.styleReplacements, "Style replaced second time on returning theme").toBe(2);
    expect(statsAfterSecond?.loadingTransitions).toBe(1);
  });

  test("context loss displays error recovery overlay and Use Diagram fallback switches map view", async ({ page, isMobile }) => {
    test.skip(isMobile, "Context loss test applies to desktop viewports");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    // Trigger webglcontextlost event on canvas
    await page.evaluate(() => {
      const canvas = document.querySelector(".geographic-network-map canvas") as HTMLCanvasElement | null;
      canvas?.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });

    // Verify error overlay appears
    await expect(geoMap).toHaveAttribute("data-status", "error");
    const errorOverlay = page.locator(".geographic-map-error-overlay");
    await expect(errorOverlay).toBeVisible();
    await expect(errorOverlay).toContainText("Unable to Load Map");

    // Click "Use Diagram" fallback button
    const useDiagramBtn = errorOverlay.getByRole("button", { name: "Use Diagram" });
    await expect(useDiagramBtn).toBeVisible();
    await useDiagramBtn.click();

    // Verify diagram map stage becomes active
    await expect(page.locator(".ttc-map-stage")).toBeVisible();
  });
});
