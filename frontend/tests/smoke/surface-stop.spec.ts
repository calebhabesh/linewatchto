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

  test("a station bay's stop links back to the station's Surface Connections, open and in view", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("14999");
    await input.press("Enter");
    const stop = page.locator("[data-surface-stop-panel='14999']");
    await expect(stop.locator(".surface-stop-station-link")).toContainText("Stub Station");
    await stop.locator(".surface-stop-station-link").click();

    const station = page.getByRole("complementary", { name: "Stub Station station details" });
    const surface = station.locator('[data-station-section="surface-connections"]');
    await expect(surface).toHaveJSProperty("open", true);
    await expect(surface.locator('[data-surface-bay-header="7"]')).toBeInViewport();
  });
});
