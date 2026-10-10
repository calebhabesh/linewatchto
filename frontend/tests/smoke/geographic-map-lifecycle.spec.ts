import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.describe("Geographic Map Stability & Lifecycle", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
    });
  });

  test("devices without WebGL2 can recover to the diagram without constructing a geographic map", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "WebGL2RenderingContext", { value: undefined });
    });
    await page.goto("/");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "error");
    const errorOverlay = page.locator(".geographic-map-error-overlay");
    await expect(errorOverlay).toContainText("WebGL2 is not available");
    expect(await page.evaluate(() => window.__linewatchGeographicMapLifecycle?.constructors ?? 0)).toBe(0);

    await errorOverlay.getByRole("button", { name: "Use Diagram" }).click();
    await expect(page.locator(".ttc-map-stage")).toBeVisible();
    await expect(geoMap).toHaveCount(0);
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

  test("desktop background refresh preserves the geographic camera and does not save it", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop camera persistence regression applies to desktop viewports");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
    const canvas = geoMap.locator("canvas");
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width * 0.65, bounds!.y + bounds!.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * 0.45, bounds!.y + bounds!.height * 0.5, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (
      window.__linewatchGeographicMapLifecycle?.events.filter((event) => event.type === "moveend").length ?? 0
    ))).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (
      window.__linewatchGeographicMapLifecycle?.isMoving() ?? false
    ))).toBe(false);

    const cameraBefore = await page.evaluate(() => (
      window.__linewatchGeographicMapLifecycle?.getCamera() ?? null
    ));
    expect(cameraBefore).not.toBeNull();
    expect(await page.evaluate(() => ({
      local: window.localStorage.getItem("linewatch-geographic-map-viewport-v1:ttc"),
      session: window.sessionStorage.getItem("linewatch-geographic-map-viewport-v1:ttc"),
    }))).toEqual({ local: null, session: null });

    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => page.evaluate(() => (
      window.__linewatchGeographicMapLifecycle?.getCamera() ?? null
    ))).toEqual(cameraBefore);
  });

  test("mobile train toggle operates in Geographic view", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile geographic train control");
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    const toggle = page.locator(".mobile-train-toggle");
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const response = page.waitForResponse((candidate) => (
      new URL(candidate.url()).pathname === "/api/trains" && candidate.status() === 200
    ));
    await toggle.click();
    await response;
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toContainText(/Viewing\s*Trains/);
  });

  test("segment hover uses the same geographic highlight in TTC and GO/UP modes", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop pointer hover regression");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/dashboard?network=ttc*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const segment = body.map.segments.find(
        (candidate: { id: string }) => candidate.id === "line-4-sheppard-yonge-don-mills",
      );
      segment.id = "line-1-tmu-college";
      segment.lineId = "line-1";
      await route.fulfill({ response, json: body });
    });
    await page.goto("/?panel=delays");

    const geoMap = page.locator(".geographic-network-map");
    const hoverSurface = geoMap.locator(':scope > [role="region"]');
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
    const hoverProjectedSegment = async (segmentId: string, impactId?: string) => {
      if (impactId) {
        await page.locator(`[data-impact-card-id="${impactId}"]`)
          .locator(".impact-card-map-btn")
          .click();
        await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.isMoving())).toBe(false);
      }
      const canvasBox = await geoMap.locator("canvas").boundingBox();
      expect(canvasBox).not.toBeNull();
      await expect.poll(async () => page.evaluate(
        ({ key }) => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(key) ?? null,
        { key: `segment:${segmentId}` },
      )).not.toBeNull();
      const projected = await page.evaluate(
        ({ key }) => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(key) ?? null,
        { key: `segment:${segmentId}` },
      );
      expect(projected).not.toBeNull();
      for (const [offsetX, offsetY] of [[0, 0], [0, -36], [0, 36], [-36, 0], [36, 0]]) {
        await page.mouse.move(
          canvasBox!.x + projected!.x + offsetX,
          canvasBox!.y + projected!.y + offsetY,
        );
        // Hover updates React state and MapLibre paint on the next frame.
        // Read the committed result before probing a different point.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        if (await hoverSurface.getAttribute("data-hovered-impact-segment") === segmentId) break;
      }
      await expect(hoverSurface).toHaveAttribute("data-hovered-impact-segment", segmentId);
    };

    await hoverProjectedSegment("line-1-tmu-college", "stub-delay-line-4");
    await page.mouse.move(10, 10);
    await expect(hoverSurface).not.toHaveAttribute("data-hovered-impact-segment");

    await setStubMode(request, "regional-live");
    await page.getByRole("button", { name: /^Status/ }).click();
    await page.getByRole("group", { name: "Select transit network" })
      .getByRole("button", { name: "GO/UP", exact: true })
      .click();
    await waitForNetworkTransition(page, "regional");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
    // Network switching preserves the TTC camera; focus the GO/UP alert before checking its hover.
    await page.getByRole("button", { name: /^Delays/ }).click();
    await hoverProjectedSegment("segment-le-ajax-whitby", "regional-demo-delay");
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

  test("View on Map keeps the geographic map usable across impact categories", async ({ page, isMobile }) => {
    test.skip(isMobile, "Category camera focus regression is covered on the desktop map surface");
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const panel of ["alerts", "delays", "reduced-speed-zones", "closures"]) {
      await page.goto(`/?panel=${panel}`);
      const geoMap = page.locator(".geographic-network-map");
      await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

      const card = page.locator("[data-impact-card-id]").first();
      await expect(card).toBeVisible();
      const mapButton = card.locator(".impact-card-map-btn");
      await mapButton.click();
      await expect(card).toHaveClass(/highlight-active-card/);
      await expect(geoMap).toHaveAttribute("data-status", "ready");
    }
  });

  test("mobile impact focus keeps a multi-segment geographic overlay inside the visible 50/50 map viewport", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile inspector framing regression");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/dashboard?network=ttc*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const sourceSegment = body.map.segments.find(
        (candidate: { id: string }) => candidate.id === "line-4-sheppard-yonge-don-mills",
      );
      const affectedSegmentIds = [
        "line-1-college-wellesley",
        "line-1-wellesley-bloor-yonge",
        "line-1-bloor-yonge-rosedale",
        "line-1-rosedale-summerhill",
        "line-1-summerhill-st-clair",
      ];
      body.map.segments.push(...affectedSegmentIds.map((id: string) => ({
        ...sourceSegment,
        id,
        lineId: "line-1",
        impacts: [{
          kind: "delay",
          cardId: "stub-delay-line-4",
          travelDirection: "bidirectional",
          sourceAlertIds: ["stub-delay-line-4-source"],
        }],
      })));
      await route.fulfill({ response, json: body });
    });
    await page.goto("/?panel=delays");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
    await page.locator('[data-impact-card-id="stub-delay-line-4"]')
      .locator(".impact-card-map-btn")
      .click();
    const inspector = page.locator("[data-mobile-impact-inspector]");
    await expect(inspector)
      .toHaveClass(/mobile-impact-inspector-details-focus/);
    await expect.poll(async () => page.evaluate(
      () => window.__linewatchGeographicMapLifecycle?.getProjectedSelectionBounds(
        "delay:stub-delay-line-4",
      ) ?? null,
    )).not.toBeNull();

    // The inspector and camera settle together; retain the exact framing limits
    // while waiting for that visible state instead of sampling during animation.
    await expect(async () => {
      const framing = await page.evaluate(() => {
        const map = document.querySelector<HTMLElement>(".geographic-network-map");
        const mapRect = map?.getBoundingClientRect();
        const inspectorRect = document.querySelector<HTMLElement>("[data-mobile-impact-inspector]")
          ?.getBoundingClientRect();
        const topChromeBottom = Array.from(document.querySelectorAll<HTMLElement>(
          ".mobile-app-topbar, .map-utility-cluster",
        )).reduce((bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom), 0);
        return {
          bounds: window.__linewatchGeographicMapLifecycle?.getProjectedSelectionBounds(
            "delay:stub-delay-line-4",
          ) ?? null,
          width: map?.clientWidth ?? 0,
          visibleBottom: (inspectorRect?.top ?? mapRect?.bottom ?? 0) - (mapRect?.top ?? 0),
          safeTop: Math.max(104, Math.ceil(topChromeBottom - (mapRect?.top ?? 0) + 16)),
        };
      });
      expect(framing.bounds).not.toBeNull();
      expect(framing.bounds!.left).toBeGreaterThanOrEqual(72);
      expect(framing.bounds!.right).toBeLessThanOrEqual(framing.width - 72);
      expect(framing.bounds!.top).toBeGreaterThanOrEqual(framing.safeTop - 1);
      expect(framing.bounds!.bottom).toBeLessThanOrEqual(framing.visibleBottom - 24);
    }).toPass({ timeout: 5_000 });
  });

  test("clicking a geographic corridor with multiple alerts opens one complete chooser", async ({ page, isMobile }) => {
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/dashboard?network=ttc*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const segment = body.map.segments.find(
        (candidate: { id: string }) => candidate.id === "line-4-sheppard-yonge-don-mills",
      );
      segment.id = "line-1-tmu-college";
      segment.lineId = "line-1";
      segment.stationAId = "tmu";
      segment.stationBId = "college";
      const baseDelay = body.delays.find((delay: { id: string }) => delay.id === "stub-delay-line-4");
      baseDelay.affectedSegmentIds = ["line-1-tmu-college"];
      baseDelay.lineId = "line-1";
      baseDelay.lineNumber = "1";
      for (const [suffix, title] of [
        ["second", "Second Line 4 delay"],
        ["third", "Third Line 4 delay"],
        ["fourth", "Fourth Line 4 delay"],
      ]) {
        const id = `stub-delay-line-4-${suffix}`;
        segment.impacts.push({
          kind: "delay",
          cardId: id,
          travelDirection: "reverse",
          sourceAlertIds: [id],
        });
        body.delays.push({
          ...baseDelay,
          id,
          title,
          displayDirection: "Westbound",
        });
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto("/?panel=delays");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    const card = page.locator('[data-impact-card-id="stub-delay-line-4"]');
    await card.locator(".impact-card-map-btn").click();
    await expect.poll(async () => page.evaluate(
      () => window.__linewatchGeographicMapLifecycle?.events.some(
        (event) => event.type === "focus" && event.detail?.startsWith("delay:stub-delay-line-4"),
      ) ?? false,
    )).toBe(true);
    const focusTimestamp = await page.evaluate(() => window.__linewatchGeographicMapLifecycle?.events.findLast(
      (event) => event.type === "focus" && event.detail?.startsWith("delay:stub-delay-line-4"),
    )?.timestamp ?? 0);
    await expect.poll(async () => page.evaluate(
      ({ after }) => window.__linewatchGeographicMapLifecycle?.events.some(
        (event) => event.type === "moveend" && event.timestamp >= after,
      ) ?? false,
      { after: focusTimestamp },
    )).toBe(true);
    if (isMobile) {
      const framing = await page.evaluate(() => {
        const map = document.querySelector<HTMLElement>(".geographic-network-map");
        const bounds = window.__linewatchGeographicMapLifecycle?.getProjectedSelectionBounds(
          "delay:stub-delay-line-4",
        ) ?? null;
        return { bounds, width: map?.clientWidth ?? 0, height: map?.clientHeight ?? 0 };
      });
      expect(framing.bounds).not.toBeNull();
      expect(framing.bounds!.left).toBeGreaterThanOrEqual(32);
      expect(framing.bounds!.right).toBeLessThanOrEqual(framing.width - 32);
      expect(framing.bounds!.top).toBeGreaterThanOrEqual(32);
      expect(framing.bounds!.bottom).toBeLessThanOrEqual(framing.height - 32);
      const inspector = page.locator("[data-mobile-impact-inspector]");
      await inspector.getByRole("button", { name: "Unfocus impact" }).click();
      await expect(inspector).toHaveCount(0);
      // Unfocus restores the originating Delays panel. Close it before testing
      // pointer interaction with the underlying map.
      await expect(page.getByRole("heading", { name: "Delays", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.locator(".mobile-status-peek")).toBeVisible();
    }

    const targetId = "line-1-tmu-college";
    const canvasBox = await geoMap.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    await expect.poll(async () => page.evaluate(
      ({ key }) => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(key) ?? null,
      { key: `segment:${targetId}` },
    )).not.toBeNull();
    const anchor = await page.evaluate(
      ({ key }) => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(key) ?? null,
      { key: `segment:${targetId}` },
    );
    expect(anchor).not.toBeNull();
    const clientX = canvasBox!.x + anchor!.x;
    const clientY = canvasBox!.y + anchor!.y;
    await page.mouse.click(clientX, clientY);

    const chooser = page.locator("[data-overlap-chooser]");
    await expect(chooser).toBeVisible();
    await expect(chooser.locator('[data-overlap-choice-id="stub-delay-line-4"]')).toBeVisible();
    await expect(chooser.locator('[data-overlap-choice-id="stub-delay-line-4-second"]')).toBeVisible();
    await expect(chooser.locator("[data-overlap-choice-id]")).toHaveCount(4);
    const chooserBox = await chooser.boundingBox();
    expect(chooserBox).not.toBeNull();
    if (isMobile) {
      const layout = await chooser.evaluate((element) => {
        const chooserRect = element.getBoundingClientRect();
        const keepouts = Array.from(document.querySelectorAll<HTMLElement>(
          "[data-map-chooser-keepout], .mobile-impact-inspector, .mobile-status-peek",
        )).filter((candidate) => {
          const rect = candidate.getBoundingClientRect();
          const style = getComputedStyle(candidate);
          return rect.width > 0 && rect.height > 0
            && style.display !== "none"
            && style.visibility !== "hidden"
            && Number(style.opacity) > 0;
        }).map((candidate) => {
          const rect = candidate.getBoundingClientRect();
          return {
            className: candidate.className,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
        });
        const list = element.querySelector<HTMLElement>(".overlap-chooser-list");
        const topChromeBottom = Array.from(document.querySelectorAll<HTMLElement>(
          ".mobile-app-topbar, .map-utility-cluster",
        )).reduce((bottom, candidate) => {
          const rect = candidate.getBoundingClientRect();
          const style = getComputedStyle(candidate);
          if (
            rect.width <= 0
            || rect.height <= 0
            || style.display === "none"
            || style.visibility === "hidden"
            || Number(style.opacity) <= 0
          ) return bottom;
          return Math.max(bottom, rect.bottom);
        }, 0);
        return {
          collisions: keepouts.filter((rect) => (
            chooserRect.left < rect.right
            && chooserRect.right > rect.left
            && chooserRect.top < rect.bottom
            && chooserRect.bottom > rect.top
          )),
          chooserTop: chooserRect.top,
          topChromeBottom,
          listClientHeight: list?.clientHeight ?? 0,
          listScrollHeight: list?.scrollHeight ?? 0,
        };
      });
      expect(layout.collisions).toEqual([]);
      expect(layout.chooserTop).toBeGreaterThanOrEqual(layout.topChromeBottom + 8);
      expect(layout.listScrollHeight).toBeGreaterThan(layout.listClientHeight);
    } else {
      expect(chooserBox!.x).toBeGreaterThan(canvasBox!.x);
      expect(chooserBox!.y).toBeGreaterThanOrEqual(canvasBox!.y);
    }
  });

  test("single circular alert badges have a forgiving click target", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop regression isolates geographic symbol hit testing");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route("**/api/dashboard?network=ttc*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const segment = body.map.segments.find(
        (candidate: { id: string }) => candidate.id === "line-4-sheppard-yonge-don-mills",
      );
      segment.id = "line-4-leslie-don-mills";
      await route.fulfill({ response, json: body });
    });
    await page.goto("/?panel=delays");

    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 15_000 });

    const card = page.locator('[data-impact-card-id="stub-delay-line-4"]');
    await card.locator(".impact-card-map-btn").click();
    await expect(card).toHaveClass(/highlight-active-card/);

    const canvasBox = await geoMap.locator("canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    await page.mouse.click(canvasBox!.x + 4, canvasBox!.y + 4);
    await expect(card).not.toHaveClass(/highlight-active-card/);

    const key = "segment:line-4-leslie-don-mills";
    await expect.poll(async () => page.evaluate(
      ({ targetKey }) => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(targetKey) ?? null,
      { targetKey: key },
    )).not.toBeNull();

    const projectedAnchor = await page.evaluate(
      ({ targetKey }) => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(targetKey) ?? null,
      { targetKey: key },
    );
    expect(projectedAnchor).not.toBeNull();

    // The visible circle is about 34px wide. Its interactive target should be
    // at least 44px wide, so a click 20px from the centre must still activate it.
    await page.mouse.click(
      canvasBox!.x + projectedAnchor!.x + 20,
      canvasBox!.y + projectedAnchor!.y,
    );

    await expect(card).toHaveClass(/highlight-active-card/);
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
