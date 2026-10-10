import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { DashboardApiResponse, NetworkId } from "../../src/app/dashboard-contract";
import { installDismissedTransientUi, setStubMode } from "./test-support";

type MapMode = "diagram" | "rotated diagram" | "geographic";

async function flushFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function openMap(page: Page, request: APIRequestContext, network: NetworkId, mode: MapMode, isMobile: boolean) {
  await setStubMode(request, "regional-live");
  await installDismissedTransientUi(page);
  await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 2048, height: 1164 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(({ network, view }) => {
    localStorage.setItem("linewatch-default-network-v1", network);
    localStorage.setItem("linewatch-map-view-v1", view);
  }, { network, view: mode === "geographic" ? "geographic" : "diagram" });
  // Exercise real MapLibre/WebGL and transit overlays without remote basemap requests.
  await page.route("https://tiles.openfreemap.org/styles/**", route => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f1f5f9" } }],
  } }));
  await page.goto("/");
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network);
  if (mode === "geographic") {
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
  } else {
    await expect(page.locator(`.${network}-map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
  }
  if (mode === "rotated diagram") {
    await page.getByRole("button", { name: /^Rotate map$/i }).click();
    await expect(page.locator(".linewatch-shell")).toHaveClass(/mobile-map-rotated/);
    await page.waitForTimeout(450);
  }
  await centerMap(page, mode);
}

function mapViewport(page: Page, network: NetworkId, mode: MapMode) {
  return mode === "geographic"
    ? page.getByRole("region", { name: network === "ttc" ? "TTC Geographic Map" : "Regional Rail Geographic Map", exact: true })
    : page.locator(network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport");
}

async function camera(page: Page, network: NetworkId, mode: MapMode) {
  if (mode !== "geographic") return page.locator(`.${network}-map-stage`).evaluate(el => el.style.transform);
  return page.evaluate(() => {
    const value = window.__linewatchGeographicMapLifecycle?.getCamera();
    if (!value) return null;
    return { lng: Number(value.lng.toFixed(8)), lat: Number(value.lat.toFixed(8)), zoom: Number(value.zoom.toFixed(8)) };
  });
}

async function settleCamera(page: Page, mode: MapMode) {
  if (mode === "geographic") {
    await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.isMoving())).toBe(false);
  }
  await flushFrames(page);
}

async function centerMap(page: Page, mode: MapMode) {
  await page.getByRole("button", { name: mode === "rotated diagram" ? "Center map" : "Center map view", exact: true }).click();
  await settleCamera(page, mode);
}

async function beginDrag(page: Page, viewport: Locator, isMobile: boolean) {
  const start = await viewport.evaluate(element => {
    const box = element.getBoundingClientRect();
    const obstacles = [...document.querySelectorAll("button, [data-overlap-chooser]")]
      .filter(control => {
        const rect = control.getBoundingClientRect();
        const centerHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return centerHit && control.contains(centerHit);
      })
      .map(control => control.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0);
    // Chromium expands touch hit targets around nearby controls. Leave enough
    // room that a native drag cannot be redirected into the chooser or HUD.
    for (const y of [0.2, 0.8, 0.35, 0.65, 0.5, 0.12, 0.9]) {
      for (const x of [0.5, 0.25, 0.75, 0.12, 0.9]) {
        const point = { x: box.left + box.width * x, y: box.top + box.height * y };
        const hit = document.elementFromPoint(point.x, point.y);
        const nearControl = obstacles.some(rect => point.x > rect.left - 36 && point.x < rect.right + 36 && point.y > rect.top - 36 && point.y < rect.bottom + 36);
        if (hit && element.contains(hit) && !nearControl && !hit.closest("button, [role='button'], [data-overlap-chooser]")) return point;
      }
    }
    throw new Error("No unobscured map point is available for a native drag");
  });
  const session = isMobile ? await page.context().newCDPSession(page) : null;
  const move = async (dx: number, dy: number) => {
    const point = { x: start.x + dx, y: start.y + dy };
    if (session) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...point, id: 1 }] });
    else await page.mouse.move(point.x, point.y);
    await flushFrames(page);
  };
  if (session) await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
  else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
  }
  return {
    move,
    async end() {
      if (session) {
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await session.detach();
      } else await page.mouse.up();
    },
  };
}

async function installGeographicOverlap(page: Page, network: NetworkId) {
  const segmentId = network === "ttc" ? "line-1-tmu-college" : "segment-lw-union-exhibition";
  await page.route(`**/api/dashboard?network=${network}*`, async route => {
    const response = await route.fetch();
    const body: DashboardApiResponse = await response.json();
    const base = body.delays[0];
    const lineId = network === "ttc" ? "line-1" : "regional-lw";
    body.delays = ["first", "second"].map(suffix => ({
      ...base, id: `mode-test-${suffix}`, lineId, lineNumber: network === "ttc" ? "1" : "LW",
      title: `Synthetic overlapping delay ${suffix}`, source: "Synthetic test fixture",
      location: network === "ttc" ? "TMU to College" : "Union to Exhibition", affectedSegmentIds: [segmentId],
    }));
    body.activeAlerts = [];
    body.plannedClosures = [];
    body.reducedSpeedZones = [];
    body.map.stationNodeImpacts = [];
    const existingIndex = body.map.segments.findIndex(segment => segment.id === segmentId);
    const replacementIndex = Math.max(0, existingIndex);
    // Regional freshness requires a complete segment catalog. Keep its shape
    // while making this fixture's only active overlay the two-alert segment.
    body.map.segments = body.map.segments.map((segment, index) => index === replacementIndex ? {
      ...segment, id: segmentId, lineId, overlay: "delay",
      stationAId: network === "ttc" ? "tmu" : "union", stationBId: network === "ttc" ? "college" : "exhibition",
      impacts: body.delays.map(delay => ({ kind: "delay", cardId: delay.id, travelDirection: "bidirectional", sourceAlertIds: [delay.id] })),
    } : { ...segment, overlay: "clear", impacts: [] });
    await route.fulfill({ response, json: body });
  });
  return segmentId;
}

async function openChooser(page: Page, network: NetworkId, mode: MapMode, isMobile: boolean, segmentId: string | null) {
  if (mode !== "geographic") {
    const marker = network === "ttc"
      ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
      : page.getByRole("button", { name: /Overlapping alerts: Delay x2 on Union to Niagara Falls/ });
    await marker.dispatchEvent("click");
  } else {
    await expect.poll(() => page.evaluate(key => window.__linewatchGeographicMapLifecycle?.getProjectedImpactAnchor(key), `segment:${segmentId}`)).not.toBeNull();
    const anchor = await page.evaluate(key => window.__linewatchGeographicMapLifecycle!.getProjectedImpactAnchor(key)!, `segment:${segmentId}`);
    const box = (await mapViewport(page, network, mode).boundingBox())!;
    if (isMobile) await page.touchscreen.tap(box.x + anchor.x, box.y + anchor.y);
    else await page.mouse.click(box.x + anchor.x, box.y + anchor.y);
  }
  await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
  await flushFrames(page);
  if (mode === "geographic") {
    await expect(page.getByRole("complementary", { name: /station details/i })).toHaveCount(0);
  }
}

for (const network of ["ttc", "regional"] as const) {
  for (const mode of ["diagram", "rotated diagram", "geographic"] as const) {
    test(`${network} ${mode} chooser closes after native panning with button and Escape`, async ({ page, request, isMobile }) => {
      test.skip(!isMobile && mode === "rotated diagram", "Rotation is a mobile Diagram feature.");
      const segmentId = mode === "geographic" ? await installGeographicOverlap(page, network) : null;
      await openMap(page, request, network, mode, isMobile);
      for (const action of ["close button", "Escape"]) {
        await centerMap(page, mode);
        await openChooser(page, network, mode, isMobile, segmentId);
        const before = await camera(page, network, mode);
        const drag = await beginDrag(page, mapViewport(page, network, mode), isMobile);
        await drag.move(-15, 10);
        const firstMove = await camera(page, network, mode);
        await drag.move(-35, 25);
        expect(await camera(page, network, mode)).not.toEqual(firstMove);
        await drag.end();
        await settleCamera(page, mode);
        expect(await camera(page, network, mode)).not.toEqual(before);
        const chooser = page.locator("[data-overlap-chooser]");
        await expect(chooser).toBeVisible();
        if (action === "Escape") {
          await chooser.getByRole("button", { name: "Close alert chooser" }).focus();
          await page.keyboard.press("Escape");
        } else if (isMobile) {
          await chooser.getByRole("button", { name: "Close alert chooser" }).tap();
        } else await chooser.getByRole("button", { name: "Close alert chooser" }).click();
        await expect(chooser, action).toHaveCount(0);
      }
    });

    test(`${network} ${mode} fitted and panned cameras survive background refresh`, async ({ page, request, isMobile }) => {
      test.skip(!isMobile && mode === "rotated diagram", "Rotation is a mobile Diagram feature.");
      await openMap(page, request, network, mode, isMobile);
      for (const explored of [false, true]) {
        await centerMap(page, mode);
        if (explored) {
          const drag = await beginDrag(page, mapViewport(page, network, mode), isMobile);
          await drag.move(-35, 25);
          await drag.end();
          await settleCamera(page, mode);
        }
        const before = await camera(page, network, mode);
        expect(before).not.toBeNull();
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
        });
        await setStubMode(request, explored ? "regional-live" : "seeded");
        await flushFrames(page);
        expect(await camera(page, network, mode)).toEqual(before);
        const refresh = page.waitForResponse(response => response.url().includes(`/api/dashboard?network=${network}`));
        await page.evaluate(() => {
          delete (document as unknown as Record<string, unknown>).visibilityState;
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
          window.dispatchEvent(new Event("focus"));
        });
        await refresh;
        await settleCamera(page, mode);
        expect(await camera(page, network, mode)).toEqual(before);
      }
    });

    test(`${network} ${mode} discards native drags interrupted by backgrounding`, async ({ page, request, isMobile }) => {
      test.skip(!isMobile && mode === "rotated diagram", "Rotation is a mobile Diagram feature.");
      await openMap(page, request, network, mode, isMobile);
      for (const interruption of ["blur", "hidden", "pagehide"]) {
        const drag = await beginDrag(page, mapViewport(page, network, mode), isMobile);
        await drag.move(-20, 15);
        const before = await camera(page, network, mode);
        await page.evaluate(interruption => {
          if (interruption === "hidden") {
            Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
            document.dispatchEvent(new Event("visibilitychange"));
          } else window.dispatchEvent(new Event(interruption));
        }, interruption);
        await drag.move(-45, 40);
        expect(await camera(page, network, mode), interruption).toEqual(before);
        await page.evaluate(() => {
          delete (document as unknown as Record<string, unknown>).visibilityState;
          document.dispatchEvent(new Event("visibilitychange"));
          window.dispatchEvent(new Event("focus"));
        });
        await drag.move(-60, 50);
        expect(await camera(page, network, mode)).toEqual(before);
        await drag.end();
        const fresh = await beginDrag(page, mapViewport(page, network, mode), isMobile);
        await fresh.move(-25, 20);
        await fresh.end();
        await settleCamera(page, mode);
        expect(await camera(page, network, mode)).not.toEqual(before);
      }
    });
  }

  test(`${network} view switching keeps native panning and background camera recovery usable`, async ({ page, request, isMobile }) => {
    await openMap(page, request, network, "diagram", isMobile);
    const views = ["diagram", "geographic", "diagram"] as const;
    for (const [index, mode] of views.entries()) {
      if (mode === "geographic") {
        await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
      } else {
        await expect(page.locator(`.${network}-map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
      }
      await centerMap(page, mode);
      const before = await camera(page, network, mode);
      const drag = await beginDrag(page, mapViewport(page, network, mode), isMobile);
      await drag.move(-15, 10);
      await drag.move(-35, 25);
      await drag.end();
      await settleCamera(page, mode);
      const panned = await camera(page, network, mode);
      expect(panned).not.toEqual(before);
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("blur"));
        delete (document as unknown as Record<string, unknown>).visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      await flushFrames(page);
      expect(await camera(page, network, mode)).toEqual(panned);
      if (index === views.length - 1) break;
      const toggle = page.getByRole("button", { name: mode === "diagram" ? "Switch to geographic map view" : "Switch to schematic system map", exact: true });
      if (isMobile) await toggle.tap();
      else await toggle.click();
    }
  });
}
