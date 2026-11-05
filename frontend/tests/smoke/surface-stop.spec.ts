import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Plan 13, S3: a streetcar stop's departures, each time labelled live or scheduled.
const STOP = { code: "100", lng: -79.400771, lat: 43.638947 };

test.describe("Surface stop departures on the Map View", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript((stop) => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      // The phone Map View reopens at its saved camera: street level, centred on the stop.
      localStorage.setItem("linewatch-geographic-map-viewport-v1:ttc", JSON.stringify({
        version: 2, lng: stop.lng, lat: stop.lat, zoom: 17, savedAt: Date.now(),
      }));
    }, STOP);
  });

  test("pressing a stop pill opens the stop with labelled times", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });

    const canvas = geoMap.locator("canvas");
    const panel = page.locator(`[data-surface-stop-panel="${STOP.code}"]`);
    // The pill draws once the streetcar asset and glyphs load; press the stop until it opens.
    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      if (!box) return false;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return panel.isVisible();
    }, { timeout: 20_000, intervals: [1_000] }).toBe(true);

    await expect(panel).toContainText("Bathurst St at Fort York Blvd");
    await expect(panel.locator("[data-live-state]")).toHaveAttribute("data-live-state", "live");
    const times = panel.locator("[data-departure-status]");
    await expect(times).toHaveCount(2);
    // The station Train Arrivals tiles: each time carries the live or schedule icon.
    await expect(times.nth(0)).toHaveAttribute("data-departure-status", "live");
    await expect(times.nth(0).locator("[data-arrival-tile-source]")).toHaveAttribute("data-arrival-tile-source", "live");
    await expect(times.nth(0)).toContainText("4 min");
    await expect(times.nth(1)).toHaveAttribute("data-departure-status", "scheduled");
    await expect(times.nth(1).locator("[data-arrival-tile-source]")).toHaveAttribute("data-arrival-tile-source", "scheduled");
    await expect(panel).not.toContainText("Live Times");

    await panel.getByRole("button", { name: "Close stop departures" }).click();
    await expect(panel).toHaveCount(0);
  });

  test("a stop number in search opens that stop, and an unknown number says so", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("100");
    // 100 is also a bus route (plan 14, U3): the route number leads and the stop is listed under Stops.
    await expect(page.locator("[data-search-group='routes'] [data-surface-route-result='ttc:100']")).toBeVisible();
    await page.locator("[data-search-group='stops'] [data-surface-stop-result='100']").click();
    await expect(page.locator("[data-surface-stop-panel='100'] [data-departure-status='live']")).toBeVisible();

    await input.click();
    await input.fill("424242");
    await input.press("Enter");
    await expect(page.locator("[data-surface-stop-panel='424242']")).toContainText("not in the TTC stop list");
  });

  test("a bus stop from search draws and is flown to with Bus Routes off, then clears", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    // Plan 14, U4: Dufferin St at College St, a bus-only pole (no streetcar stops there).
    const busStop = { code: "2034", lng: -79.43266, lat: 43.65266 };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const busesSwitch = page.locator("[data-bus-toggle]").first();
    await expect(busesSwitch).toHaveAttribute("data-checked", "false");

    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill(busStop.code);
    await page.locator(`[data-search-group='stops'] [data-surface-stop-result='${busStop.code}']`).click();
    const panel = page.locator(`[data-surface-stop-panel='${busStop.code}']`);
    await expect(panel).toBeVisible();

    // Only the selection draws: its pill, not the Buses switch's layers.
    const mapSurface = geoMap.locator(':scope > [role="region"]');
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-stops/, { timeout: 15_000 });
    await expect(busesSwitch).toHaveAttribute("data-checked", "false");
    await expect.poll(async () => {
      const camera = await page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera() ?? null);
      return Boolean(camera && camera.zoom >= 15.9
        && Math.abs(camera.lng - busStop.lng) < 0.01 && Math.abs(camera.lat - busStop.lat) < 0.01);
    }, { timeout: 15_000 }).toBe(true);

    await panel.getByRole("button", { name: "Close stop departures" }).click();
    await expect(panel).toHaveCount(0);
    await expect(mapSurface).not.toHaveAttribute("data-surface-selection-layers");
  });

  test("route panel: View on Map with Bus Routes off, a stop's departures in two taps, and Back", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    // Plan 14, U5: the 29 Dufferin, a bus route, with the Buses switch off.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const busesSwitch = page.locator("[data-bus-toggle]").first();
    await expect(busesSwitch).toHaveAttribute("data-checked", "false");
    const mapSurface = geoMap.locator(':scope > [role="region"]');

    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("29");
    await page.locator("[data-search-group='routes'] [data-surface-route-result='ttc:29']").click();
    const route = page.locator("[data-surface-route-panel='ttc:29']");
    await expect(route).toContainText("Not live service.");
    await expect(route.getByRole("button", { name: "Southbound" })).toHaveAttribute("aria-pressed", "true");
    const stop = route.locator("[data-surface-route-stop='2034']");
    await expect(stop).toContainText("Dufferin St at College St");
    // Nothing is drawn until the rider asks.
    await expect(mapSurface).not.toHaveAttribute("data-surface-selection-layers");

    const viewOnMap = route.getByRole("button", { name: "View on Map" });
    await viewOnMap.click();
    await expect(route.getByRole("button", { name: /Shown on Map/ })).toHaveAttribute("aria-pressed", "true");
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-line/, { timeout: 15_000 });
    await expect(busesSwitch).toHaveAttribute("data-checked", "false");
    // Framed: the whole route (Exhibition to Wilson, about 16 km) at a city zoom. The camera
    // reports the canvas centre, which sits west of the route: the full-width map keeps the
    // sidebar clear (about 0.07 degrees at this zoom).
    await expect.poll(async () => {
      const camera = await page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera() ?? null);
      return Boolean(camera && camera.zoom > 10.5 && camera.zoom < 13
        && camera.lng > -79.56 && camera.lng < -79.40 && camera.lat > 43.64 && camera.lat < 43.76);
    }, { timeout: 15_000 }).toBe(true);

    // Second tap: the stop's departures, each labelled.
    await stop.click();
    const stopPanel = page.locator("[data-surface-stop-panel='2034']");
    await expect(stopPanel.locator("[data-departure-status='live']")).toBeVisible();
    await expect(stopPanel.locator("[data-departure-status='scheduled']")).toBeVisible();
    await expect(route).toHaveCount(0);
    // The route panel is closed, so its route is no longer drawn; the stop is.
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-stops/);

    // Back returns to the route panel where the rider left it, drawn again.
    await stopPanel.getByRole("button", { name: "Back to route 29 Dufferin" }).click();
    await expect(stopPanel).toHaveCount(0);
    await expect(route).toBeVisible();
    await expect(route.getByRole("button", { name: /Shown on Map/ })).toHaveAttribute("aria-pressed", "true");
    await expect(route.locator("[data-surface-route-stop='2034']")).toBeInViewport();
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-line/);

    await route.getByRole("button", { name: "Close route" }).click();
    await expect(route).toHaveCount(0);
    await expect(mapSurface).not.toHaveAttribute("data-surface-selection-layers");
    await expect(busesSwitch).toHaveAttribute("data-checked", "false");
  });

  test("Search Stops narrows a route's stops, offers the other direction, and survives a stop and Back", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const search = page.getByPlaceholder(/Search all stations/);
    await search.click();
    await search.fill("29");
    await page.locator("[data-search-group='routes'] [data-surface-route-result='ttc:29']").click();
    const route = page.locator("[data-surface-route-panel='ttc:29']");
    const filter = route.getByPlaceholder("Search Stops");
    const stops = route.locator("[data-surface-route-stop]");
    await expect(route.locator("[data-surface-route-stop='2034']")).toBeVisible();
    const total = await stops.count();
    expect(total).toBeGreaterThan(5);

    // By name, in the stop's long or short form, with a count on the direction.
    await filter.fill("dufferin college");
    await expect(route.locator("[data-surface-route-stop='2034']")).toBeVisible();
    expect(await stops.count()).toBeLessThan(total);
    await expect(route.getByRole("button", { name: /^Southbound/ }).locator(".surface-route-filter-count")).not.toHaveText("0");
    await expect(route.locator("[data-surface-route-stop='2034'] mark").first()).toBeVisible();

    // Enter opens the top match; Back returns to the same filtered list.
    await filter.fill("2034");
    await expect(stops).toHaveCount(1);
    await filter.press("Enter");
    const stop = page.locator("[data-surface-stop-panel='2034']");
    await expect(stop).toBeVisible();
    await stop.locator(".surface-route-back-link").first().click();
    await expect(filter).toHaveValue("2034");
    await expect(stops).toHaveCount(1);

    // In the other direction it says where the stop is, and goes there.
    await route.getByRole("button", { name: /^Northbound/ }).click();
    await expect(stops).toHaveCount(0);
    await expect(route).toContainText("No matching stops on this list.");
    await route.getByRole("button", { name: /^Show .*Southbound/ }).first().click();
    await expect(route.locator("[data-surface-route-stop='2034']")).toBeVisible();

    // Nothing on the route; Escape clears before it does anything else.
    await filter.fill("zzzzz");
    await expect(route).toContainText("No stops on this route match.");
    await filter.press("Escape");
    await expect(filter).toHaveValue("");
    await expect(route).toBeVisible();
    await expect(stops).toHaveCount(total);
  });

  async function openRoute(page: import("@playwright/test").Page, number: string) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const search = page.getByPlaceholder(/Search all stations/);
    await search.click();
    await search.fill(number);
    await page.locator(`[data-search-group='routes'] [data-surface-route-result='ttc:${number}']`).click();
    return page.locator(`[data-surface-route-panel='ttc:${number}']`);
  }

  test("a route's branches are named and selectable, each way has one stop list, and Back keeps the branch", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    const route = await openRoute(page, "52");
    await expect(route.locator(".surface-route-title-badge")).toHaveText("52");
    await expect(route.getByRole("heading", { name: "Branches" })).toBeVisible();
    const branch = (id: string) => route.locator(`[data-route-variant="${id}"]`);
    // The plain "52" return trips belong to the branches they run back along.
    await expect(branch("52")).toHaveCount(0);
    await expect(branch("52A")).toContainText("Pearson Airport via Dixon Rd");
    await expect(branch("52F")).toContainText("Sunnybrook Hospital via Lawrence Station");

    await branch("52F").click();
    await expect(branch("52F")).toHaveAttribute("aria-pressed", "true");
    await expect(route.locator(".surface-route-branch-label")).toContainText("52F towards Sunnybrook Hospital");
    const firstStop = route.locator("[data-surface-route-stop]").first();
    const eastFirst = await firstStop.getAttribute("data-surface-route-stop");
    await route.getByRole("button", { name: /^Westbound/ }).click();
    await expect(route.locator(".surface-route-branch-label")).toContainText("52F towards Royal York");
    await expect(branch("52F")).toHaveAttribute("aria-pressed", "true");
    await expect(firstStop).not.toHaveAttribute("data-surface-route-stop", eastFirst!);

    const stopCode = await firstStop.getAttribute("data-surface-route-stop");
    await firstStop.click();
    await page.locator(`[data-surface-stop-panel="${stopCode}"] .surface-route-back-link`).first().click();
    await expect(branch("52F")).toHaveAttribute("aria-pressed", "true");
  });

  test("View on Map draws the chosen branch and follows it; Back from a stop redraws it", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    const route = await openRoute(page, "52");
    const mapSurface = page.locator(".geographic-network-map > [role='region']");
    await route.locator('[data-route-variant="52F"]').click();
    await route.getByRole("button", { name: "View on Map" }).click();
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-line/, { timeout: 15_000 });
    const camera = () => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera() ?? null);
    await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.isMoving())).toBe(false);
    const on52F = await camera();

    // Another branch is framed again, without turning View on Map off.
    await route.locator('[data-route-variant="52A"]').click();
    await expect(route.getByRole("button", { name: /Shown on Map/ })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => {
      const current = await camera();
      return Boolean(current && on52F && (current.lng !== on52F.lng || current.zoom !== on52F.zoom));
    }, { timeout: 15_000 }).toBe(true);

    await route.locator("[data-surface-route-stop]").first().click();
    await page.locator(".surface-route-back-link").first().click();
    await expect(route.locator('[data-route-variant="52A"]')).toHaveAttribute("aria-pressed", "true");
    await expect(route.getByRole("button", { name: /Shown on Map/ })).toHaveAttribute("aria-pressed", "true");
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-line/);
  });

  test("an express variant and its regular route jump to each other; an unrelated number does not", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    const route = await openRoute(page, "89");
    await expect(route.getByRole("heading", { name: "Express Variant" })).toBeVisible();
    await route.getByRole("button", { name: /^Jump to route 989 / }).click();
    const express = page.locator("[data-surface-route-panel='ttc:989']");
    await expect(express).toBeVisible();
    await expect(express.getByRole("heading", { name: "Regular Route" })).toBeVisible();
    // Still reached from search.
    await expect(express.locator("[data-search-back]")).toBeVisible();
    await express.getByRole("button", { name: /^Jump to route 89 / }).click();
    await expect(route).toBeVisible();
  });

  test("a direction the branch does not run opens the busiest branch that does", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    const route = await openRoute(page, "939");
    const branch = (id: string) => route.locator(`[data-route-variant="${id}"]`);
    await branch("939A").click();
    await expect(route.getByRole("button", { name: /^Westbound/ })).toHaveAttribute("aria-pressed", "true");
    await route.getByRole("button", { name: /^Eastbound/ }).click();
    await expect(branch("939A")).toHaveAttribute("aria-pressed", "false");
    await expect(route.getByRole("button", { name: /^Eastbound/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("an undrawn route says so instead of offering View on Map", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("503");
    await page.locator("[data-search-group='routes'] [data-surface-route-result='ttc:503']").click();
    const route = page.locator("[data-surface-route-panel='ttc:503']");
    await expect(route).toContainText("Not on the map");
    await expect(route.getByRole("button", { name: "View on Map" })).toHaveCount(0);
    await expect(route.locator("[data-surface-route-stop]")).toHaveCount(0);
  });

  test("a station bay's stop links back to the station's Surface Connections, open and in view", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("14999");
    await input.press("Enter");
    const stop = page.locator("[data-surface-stop-panel='14999']");
    await expect(stop.locator(".surface-stop-station-link:not([data-search-back])")).toContainText("Stub Station");
    await stop.locator(".surface-stop-station-link:not([data-search-back])").click();

    const station = page.getByRole("complementary", { name: "Stub Station station details" });
    const surface = station.locator('[data-station-section="surface-connections"]');
    await expect(surface).toHaveJSProperty("open", true);
    await expect(surface.locator('[data-surface-bay-header="7"]')).toBeInViewport();
  });
});
