import { expect, test } from "@playwright/test";

const stubUrl = "http://127.0.0.1:4174";
const openMapPreviewUrl = "/?previewTime=2026-08-14T16:00:00.000Z";

test("iPhone SE uses compact chrome and contained onboarding and status sheets", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "compact phone coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    window.localStorage.removeItem("linewatch-welcome-seen-v1");
    window.localStorage.removeItem("linewatch-unofficial-notice-ack-v1");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto(openMapPreviewUrl);

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

test("mobile TTC recenter cycles keep one stable camera surface without compositor churn", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile compositor durability coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto(openMapPreviewUrl);

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
      flattenedRasterPlanes: number;
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
        flattenedRasterPlanes: rasterPlanes.filter((plane) => (
          getComputedStyle(plane).transform === "none"
          && getComputedStyle(plane).backfaceVisibility === "visible"
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
      flattenedRasterPlanes: 3,
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

test("fixed mobile pinch zoom keeps one stable camera surface across both networks", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "fixed mobile pinch durability coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto(openMapPreviewUrl);

  const exerciseFixedPinch = async (network: "ttc" | "regional") => {
    const stage = network === "ttc"
      ? page.locator(".ttc-map-stage")
      : page.locator(".regional-map-stage");
    await expect(stage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(stage.locator(".raster-map-plane")).toHaveCount(3);

    const result = await page.evaluate(async ({ activeNetwork }) => {
      const gestureTarget = activeNetwork === "ttc"
        ? document.querySelector<HTMLElement>("[data-map-pan-zoom-viewport]")
        : document.querySelector<HTMLElement>(".regional-map-viewport");
      const mapStage = gestureTarget?.querySelector<HTMLElement>(
        activeNetwork === "ttc" ? ".ttc-map-stage" : ".regional-map-stage",
      );
      if (!gestureTarget || !mapStage) throw new Error(`Missing ${activeNetwork} fixed map`);

      const rasterPlanes = Array.from(mapStage.querySelectorAll<HTMLElement>(".raster-map-plane"));
      const originalChildren = Array.from(mapStage.children);
      const viewportSize = { width: gestureTarget.clientWidth, height: gestureTarget.clientHeight };
      const cycles = [];
      const sendPointer = (
        type: string,
        pointerId: number,
        clientX: number,
        clientY: number,
      ) => gestureTarget.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        buttons: type === "pointerup" ? 0 : 1,
        cancelable: true,
        clientX,
        clientY,
        isPrimary: pointerId === 1,
        pointerId,
        pointerType: "touch",
      }));

      for (let cycle = 0; cycle < 8; cycle += 1) {
        const rect = gestureTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const zoomingIn = cycle % 2 === 0;
        const startSpan = zoomingIn ? 52 : 104;
        const endSpan = zoomingIn ? 104 : 52;
        const beforeTransform = mapStage.style.transform;

        sendPointer("pointerdown", 1, centerX - startSpan / 2, centerY);
        sendPointer("pointerdown", 2, centerX + startSpan / 2, centerY);
        sendPointer("pointermove", 1, centerX - endSpan / 2, centerY);
        sendPointer("pointermove", 2, centerX + endSpan / 2, centerY);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        sendPointer("pointerup", 2, centerX + endSpan / 2, centerY);
        sendPointer("pointerup", 1, centerX - endSpan / 2, centerY);
        await new Promise((resolve) => window.setTimeout(resolve, 0));

        cycles.push({
          cameraChanged: mapStage.style.transform !== beforeTransform,
          gestureActive: activeNetwork === "ttc"
            ? gestureTarget.dataset.mapGestureActive
            : gestureTarget.closest<HTMLElement>(".regional-map")?.dataset.mapGestureActive,
          heightStable: gestureTarget.clientHeight === viewportSize.height,
          stageOpacity: getComputedStyle(mapStage).opacity,
          stageTransitionDuration: getComputedStyle(mapStage).transitionDuration,
          widthStable: gestureTarget.clientWidth === viewportSize.width,
        });
      }

      return {
        cycles,
        flattenedRasterPlanes: rasterPlanes.filter((plane) => (
          getComputedStyle(plane).transform === "none"
          && getComputedStyle(plane).backfaceVisibility === "visible"
        )).length,
        mapChildrenPreserved: Array.from(mapStage.children)
          .every((child, index) => child === originalChildren[index]),
        mapStagePreserved: gestureTarget.querySelector(
          activeNetwork === "ttc" ? ".ttc-map-stage" : ".regional-map-stage",
        ) === mapStage,
        rasterPlanesPreserved: Array.from(mapStage.querySelectorAll(".raster-map-plane"))
          .every((plane, index) => plane === rasterPlanes[index]),
      };
    }, { activeNetwork: network });

    expect(result).toMatchObject({
      flattenedRasterPlanes: 3,
      mapChildrenPreserved: true,
      mapStagePreserved: true,
      rasterPlanesPreserved: true,
    });
    expect(result.cycles).toHaveLength(8);
    expect(result.cycles.every((cycle) => (
      cycle.cameraChanged
      && cycle.gestureActive === "false"
      && cycle.heightStable
      && cycle.stageOpacity === "1"
      && cycle.stageTransitionDuration === "0s"
      && cycle.widthStable
    ))).toBe(true);
  };

  await exerciseFixedPinch("ttc");
  const ttcStage = page.locator(".ttc-map-stage");
  await ttcStage.evaluate((stage) => {
    stage.dataset.fixedPinchStageProbe = "preserved";
  });
  const overlapMarker = page.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapMarker).toBeVisible();
  await overlapMarker.dispatchEvent("pointerdown", {
    button: 0,
    buttons: 1,
    isPrimary: true,
    pointerId: 31,
    pointerType: "touch",
  });
  await overlapMarker.dispatchEvent("pointerup", {
    button: 0,
    buttons: 0,
    isPrimary: true,
    pointerId: 31,
    pointerType: "touch",
  });
  await overlapMarker.dispatchEvent("click");
  await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
  await expect(ttcStage).toHaveAttribute("data-fixed-pinch-stage-probe", "preserved");
  await page.getByRole("button", { name: "Close alert chooser", exact: true }).click();

  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await exerciseFixedPinch("regional");
});

test("rotated mobile pinch zoom keeps one oriented map camera across both networks", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "rotated camera coverage runs in the touch-device project");

  await request.post(`${stubUrl}/__test/mode`, { data: { mode: "seeded" } });
  await page.setViewportSize({ width: 412, height: 915 });
  await page.addInitScript(() => {
    window.localStorage.setItem("linewatch-welcome-seen-v1", "true");
    window.localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    window.localStorage.setItem("linewatch-pwa-install-dismissed-at-v1", String(Date.now()));
  });
  await page.goto(openMapPreviewUrl);

  const exerciseRotatedPinch = async (network: "ttc" | "regional") => {
    await page.getByRole("button", { name: "Rotate map" }).click();
    const shell = page.locator(".linewatch-shell");
    await expect(shell).toHaveClass(/mobile-map-rotated/);

    const stage = network === "ttc"
      ? page.locator(".ttc-map-stage")
      : page.locator(".regional-map-stage");
    await expect(stage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(stage.locator(".raster-map-plane")).toHaveCount(3);

    const result = await page.evaluate(async ({ activeNetwork }) => {
      const shellElement = document.querySelector<HTMLElement>(".linewatch-shell.mobile-map-rotated");
      const main = shellElement?.querySelector<HTMLElement>(":scope > main");
      const uiSurface = main?.querySelector<HTMLElement>(".rotated-map-ui-surface");
      const gestureTarget = activeNetwork === "ttc"
        ? document.querySelector<HTMLElement>("[data-map-pan-zoom-viewport]")
        : document.querySelector<HTMLElement>(".regional-map-viewport");
      const mapStage = gestureTarget?.querySelector<HTMLElement>(
        activeNetwork === "ttc" ? ".ttc-map-stage" : ".regional-map-stage",
      );
      if (!shellElement || !main || !uiSurface || !gestureTarget || !mapStage) {
        throw new Error(`Missing ${activeNetwork} rotated pinch elements`);
      }

      const rasterPlanes = Array.from(mapStage.querySelectorAll<HTMLElement>(".raster-map-plane"));
      const originalChildren = Array.from(mapStage.children);
      const logicalSize = { width: gestureTarget.clientWidth, height: gestureTarget.clientHeight };
      const rootStyle = document.documentElement.style;
      const previousVisualHeight = rootStyle.getPropertyValue("--visual-viewport-height");
      const previousVisualWidth = rootStyle.getPropertyValue("--visual-viewport-width");
      const cycles = [];

      const sendPointer = (
        type: string,
        pointerId: number,
        clientX: number,
        clientY: number,
      ) => {
        gestureTarget.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          buttons: type === "pointerup" ? 0 : 1,
          cancelable: true,
          clientX,
          clientY,
          isPrimary: pointerId === 1,
          pointerId,
          pointerType: "touch",
        }));
      };

      for (let cycle = 0; cycle < 6; cycle += 1) {
        const rect = gestureTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const zoomingIn = cycle % 2 === 0;
        const startSpan = zoomingIn ? 56 : 112;
        const endSpan = zoomingIn ? 112 : 56;
        const beforeTransform = mapStage.style.transform;

        sendPointer("pointerdown", 1, centerX - startSpan / 2, centerY);
        sendPointer("pointerdown", 2, centerX + startSpan / 2, centerY);

        // Simulate the visualViewport resize noise some mobile browsers emit
        // during pinch. The frozen rotated frame must not consume these values.
        rootStyle.setProperty("--visual-viewport-height", `${700 - cycle * 7}px`);
        rootStyle.setProperty("--visual-viewport-width", `${360 - cycle * 3}px`);

        sendPointer("pointermove", 1, centerX - endSpan / 2, centerY);
        sendPointer("pointermove", 2, centerX + endSpan / 2, centerY);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        sendPointer("pointerup", 2, centerX + endSpan / 2, centerY);
        sendPointer("pointerup", 1, centerX - endSpan / 2, centerY);
        await new Promise((resolve) => window.setTimeout(resolve, 0));

        cycles.push({
          cameraChanged: mapStage.style.transform !== beforeTransform,
          gestureActive: activeNetwork === "ttc"
            ? gestureTarget.dataset.mapGestureActive
            : gestureTarget.closest<HTMLElement>(".regional-map")?.dataset.mapGestureActive,
          heightStable: gestureTarget.clientHeight === logicalSize.height,
          widthStable: gestureTarget.clientWidth === logicalSize.width,
          stageOpacity: getComputedStyle(mapStage).opacity,
          stageTransitionDuration: getComputedStyle(mapStage).transitionDuration,
          stageWillChange: getComputedStyle(mapStage).willChange,
        });
      }

      if (previousVisualHeight) {
        rootStyle.setProperty("--visual-viewport-height", previousVisualHeight);
      } else {
        rootStyle.removeProperty("--visual-viewport-height");
      }
      if (previousVisualWidth) {
        rootStyle.setProperty("--visual-viewport-width", previousVisualWidth);
      } else {
        rootStyle.removeProperty("--visual-viewport-width");
      }

      const mainStyle = getComputedStyle(main);
      const stageMatrix = new DOMMatrixReadOnly(getComputedStyle(mapStage).transform);
      return {
        contain: mainStyle.contain,
        cycles,
        flattenedRasterPlanes: rasterPlanes.filter((plane) => (
          getComputedStyle(plane).transform === "none"
          && getComputedStyle(plane).backfaceVisibility === "visible"
        )).length,
        isolation: mainStyle.isolation,
        mainTransform: mainStyle.transform,
        mapChildrenPreserved: Array.from(mapStage.children)
          .every((child, index) => child === originalChildren[index]),
        orientedCamera: Math.abs(stageMatrix.a) < 0.0001 && Math.abs(stageMatrix.b) > 0,
        rasterPlanesPreserved: Array.from(mapStage.querySelectorAll(".raster-map-plane"))
          .every((plane, index) => plane === rasterPlanes[index]),
        uiSurfaceRotated: getComputedStyle(uiSurface).transform !== "none",
      };
    }, { activeNetwork: network });

    expect(result).toMatchObject({
      flattenedRasterPlanes: 3,
      isolation: "isolate",
      mainTransform: "none",
      mapChildrenPreserved: true,
      orientedCamera: true,
      rasterPlanesPreserved: true,
      uiSurfaceRotated: true,
    });
    expect(result.contain.split(" ")).toEqual(expect.arrayContaining(["layout", "paint", "size"]));
    expect(result.cycles).toHaveLength(6);
    expect(result.cycles.every((cycle) => (
      cycle.cameraChanged
      && cycle.gestureActive === "false"
      && cycle.heightStable
      && cycle.widthStable
      && cycle.stageOpacity === "1"
      && cycle.stageTransitionDuration === "0s"
      && cycle.stageWillChange === "auto"
    ))).toBe(true);

    await page.getByRole("button", { name: "Exit rotated map" }).click();
    await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  };

  await exerciseRotatedPinch("ttc");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true })
    .click();
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await exerciseRotatedPinch("regional");
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
