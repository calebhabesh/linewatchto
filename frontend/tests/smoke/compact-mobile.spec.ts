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
  await expect(mobileMapStage).toHaveCSS("opacity", "1");
  await expect(mobileMapStage).toHaveCSS("will-change", "auto");
  await expect(mobileMapStage).toHaveCSS("transition-duration", "0s");
  await expect(mobileMapStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(page.locator("[data-map-pan-zoom-viewport]")).toHaveAttribute("data-map-camera-moving", "false");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-network-transition-direction");
  const regionalMap = page.locator(".regional-map");
  const regionalMapStage = regionalMap.locator(".regional-map-stage");
  await expect(regionalMap).toBeVisible();
  await page.getByRole("button", { name: "Center map view" }).click();
  await expect(regionalMapStage).toHaveCSS("transition-duration", "0s");
  await expect(regionalMapStage).toHaveCSS("will-change", "auto");
  await expect(regionalMapStage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(regionalMap).toHaveAttribute("data-regional-map-camera-moving", "false");

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "TTC", exact: true })
    .click();
  const returnedTtcStage = page.locator(".ttc-map-stage");
  await expect(returnedTtcStage).toHaveAttribute("data-raster-map-ready", "true");
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

test("mobile TTC recenter cycles keep independent raster planes without compositor churn", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile compositor durability coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto("/");

  const stage = page.locator(".ttc-map-stage");
  await expect(stage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(stage.locator(".raster-map-plane")).toHaveCount(3);
  await expect(stage.locator(".raster-map-plane--labels")).toHaveCount(1);
  await expect(stage.locator(".overlay-segment-group").first()).toBeAttached();

  const cycleResults = await page.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>("[data-map-pan-zoom-viewport]");
    const originalStage = viewport?.querySelector<HTMLElement>(".ttc-map-stage");
    const originalSvg = originalStage?.querySelector<SVGSVGElement>(".ttc-svg-container > svg");
    const originalOverlay = originalStage?.querySelector<SVGGElement>(".overlay-segment-group");
    const recenter = document.querySelector<HTMLButtonElement>('button[aria-label="Center map view"]');
    const zoomIn = document.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    if (!viewport || !originalStage || !originalSvg || !originalOverlay || !recenter || !zoomIn) {
      throw new Error("Missing TTC mobile recenter durability elements");
    }

    const entranceDeadline = performance.now() + 1_500;
    while (
      viewport.dataset.mapCameraMoving === "true"
      && performance.now() < entranceDeadline
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }

    const rasterPlanes = Array.from(originalStage.querySelectorAll<HTMLElement>(".raster-map-plane"));
    const cycles: Array<{
      cameraChanged: boolean;
      stageOpacity: string;
      stageWillChange: string;
      stageAnimations: number;
      recenterLayerCount: number;
      rasterPlaneCount: number;
      independentlyPromotedPlanes: number;
    }> = [];

    for (let cycle = 0; cycle < 12; cycle += 1) {
      const centeredTransform = originalStage.style.transform;
      zoomIn.click();
      const zoomDeadline = performance.now() + 750;
      while (
        originalStage.style.transform === centeredTransform
        && performance.now() < zoomDeadline
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
      const zoomedTransform = originalStage.style.transform;
      recenter.click();
      cycles.push({
        cameraChanged: zoomedTransform !== originalStage.style.transform,
        stageOpacity: getComputedStyle(originalStage).opacity,
        stageWillChange: getComputedStyle(originalStage).willChange,
        stageAnimations: originalStage.getAnimations().length,
        recenterLayerCount: viewport.querySelectorAll(".ttc-map-recenter-veil").length,
        rasterPlaneCount: rasterPlanes.length,
        independentlyPromotedPlanes: rasterPlanes.filter((plane) => (
          getComputedStyle(plane).transform !== "none"
          && getComputedStyle(plane).backfaceVisibility === "hidden"
        )).length,
      });
    }

    return {
      cycles,
      stagePreserved: viewport.querySelector(".ttc-map-stage") === originalStage,
      svgPreserved: originalStage.querySelector(".ttc-svg-container > svg") === originalSvg,
      overlayPreserved: originalStage.querySelector(".overlay-segment-group") === originalOverlay,
      rasterPlanesPreserved: Array.from(originalStage.querySelectorAll(".raster-map-plane"))
        .every((plane, index) => plane === rasterPlanes[index]),
    };
  });

  expect(cycleResults.cycles).toHaveLength(12);
  for (const cycle of cycleResults.cycles) {
    expect(cycle).toEqual({
      cameraChanged: true,
      stageOpacity: "1",
      stageWillChange: "auto",
      stageAnimations: 0,
      recenterLayerCount: 0,
      rasterPlaneCount: 3,
      independentlyPromotedPlanes: 3,
    });
  }
  expect(cycleResults).toMatchObject({
    stagePreserved: true,
    svgPreserved: true,
    overlayPreserved: true,
    rasterPlanesPreserved: true,
  });

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  const regionalStage = page.locator(".regional-map-stage");
  await expect(regionalStage).toHaveAttribute("data-raster-map-ready", "true");
  await expect(regionalStage.locator(".raster-map-plane")).toHaveCount(3);
  const regionalCycles = await regionalStage.evaluate(async (originalStage) => {
    const root = originalStage.closest<HTMLElement>(".regional-map");
    const recenter = root?.querySelector<HTMLButtonElement>('button[aria-label="Fit regional network"]');
    const zoomIn = root?.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const rasterPlanes = Array.from(originalStage.querySelectorAll(".raster-map-plane"));
    if (!root || !recenter || !zoomIn || rasterPlanes.length !== 3) {
      throw new Error("Missing regional mobile recenter durability elements");
    }

    const entranceDeadline = performance.now() + 1_500;
    while (
      root.dataset.regionalMapCameraMoving === "true"
      && performance.now() < entranceDeadline
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }

    const results = [];
    for (let cycle = 0; cycle < 12; cycle += 1) {
      const centeredTransform = originalStage.style.transform;
      zoomIn.click();
      const zoomDeadline = performance.now() + 750;
      while (
        originalStage.style.transform === centeredTransform
        && performance.now() < zoomDeadline
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 16));
      }
      const zoomedTransform = originalStage.style.transform;
      recenter.click();
      results.push({
        cameraChanged: zoomedTransform !== originalStage.style.transform,
        stageWillChange: getComputedStyle(originalStage).willChange,
        stageAnimations: originalStage.getAnimations().length,
        recenterLayerCount: root.querySelectorAll(".regional-map-recenter-veil").length,
        rasterPlanesPreserved: Array.from(originalStage.querySelectorAll(".raster-map-plane"))
          .every((plane, index) => plane === rasterPlanes[index]),
      });
    }
    return results;
  });
  expect(regionalCycles).toHaveLength(12);
  expect(regionalCycles.every((cycle) => (
    cycle.cameraChanged
    && cycle.stageWillChange === "auto"
    && cycle.stageAnimations === 0
    && cycle.recenterLayerCount === 0
    && cycle.rasterPlanesPreserved
  ))).toBe(true);

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "TTC", exact: true })
    .click();

  await page.getByRole("button", { name: "Center map view" }).click();
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("region", { name: "Current service status" })).toBeVisible();
  await expect(stage).toHaveCSS("opacity", "1");
  await expect(stage).toHaveCSS("will-change", "auto");
  await expect(page.locator(".ttc-map-recenter-veil")).toHaveCount(0);
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
