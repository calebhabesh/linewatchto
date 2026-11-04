import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

// Plan 13, S6: GO buses on the GO/UP Map View behind their own toggle, off by
// default and remembered on the device. Stop 00008 is Yonge St. @ Sheppard Ave.
const STOP = { code: "00008", lng: -79.41119, lat: 43.7616 };

test.use({ serviceWorkers: "block" });

test.describe("GO buses on the GO/UP Map View", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript((stop) => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-default-network-v1", "regional");
      localStorage.setItem("linewatch-geographic-map-viewport-v1:regional", JSON.stringify({
        version: 2, lng: stop.lng, lat: stop.lat, zoom: 15, savedAt: Date.now(),
      }));
    }, STOP);
  });

  test("the phone toggle is off by default, remembered, and opens GO stop departures", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    const assets: string[] = [];
    page.on("request", (request) => {
      if (/surface-bus/.test(request.url())) assets.push(request.url().split("/").pop() ?? "");
    });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(geoMap).toHaveAttribute("data-network", "regional");
    const toggle = page.locator(".mobile-bus-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("aria-label", "Show GO bus routes and stops");
    await expect(toggle).toContainText("GO Buses");
    expect(assets, "nothing loads while GO buses are off").toEqual([]);

    await toggle.click();
    await expect(geoMap).toHaveAttribute("data-go-buses", "on");
    await expect(geoMap).not.toHaveAttribute("data-buses", "on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-go-buses-v1"))).toBe("on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-buses-v1"))).toBeNull();

    await page.reload();
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator(".mobile-bus-toggle")).toHaveAttribute("aria-pressed", "true");

    const canvas = geoMap.locator("canvas");
    const panel = page.locator(`[data-go-bus-stop-panel="${STOP.code}"]`);
    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      if (!box) return false;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return panel.isVisible();
    }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
    expect(assets).toContain("go-surface-bus.json");
    expect(assets).toContain("go-surface-bus-stops.json");
    expect(assets.some((name) => name.startsWith("ttc-surface-bus"))).toBe(false);
    await expect(panel).toContainText("Yonge St. @ Sheppard Ave.");
    await expect(panel).toContainText("Metrolinx live estimates + GO schedule");
    await expect(panel.locator('[data-surface-route="19"]')).toBeVisible();
    await expect(panel.locator('[data-surface-route="96"]')).toBeVisible();
    await panel.getByRole("button", { name: "Close stop departures" }).click();
    await expect(panel).toHaveCount(0);

    await page.locator(".mobile-bus-toggle").click();
    await expect(geoMap).not.toHaveAttribute("data-go-buses", "on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-go-buses-v1"))).toBe("off");
  });

  test("the desktop deck carries Trains and GO Buses on GO/UP, and TTC's switches on TTC", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop toolbar");
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const row = page.locator("#map-view-layers-row");
    await expect(row).toHaveAttribute("data-network", "regional");
    await expect(row.locator(".map-layer-switch-label")).toHaveText(["Train Markers", "GO Buses", "Live GPS"]);
    // Live GO buses (S9): on by default, drawn only once GO Buses is on.
    const liveGps = row.locator("#map-layer-go-bus-positions");
    await expect(liveGps).toHaveAttribute("aria-checked", "true");
    await expect(row.locator(".map-layer-switch").nth(2)).toContainText("With GO Buses");
    await expect(row.getByRole("switch", { name: /Toggle estimated train markers/ })).toBeVisible();
    await expect(page.locator(".desktop-train-toggle-btn")).toBeHidden();

    const goBuses = row.locator("#map-layer-go-bus-routes");
    await expect(goBuses).toHaveAttribute("aria-checked", "false");
    await goBuses.click();
    await expect(geoMap).toHaveAttribute("data-go-buses", "on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-go-buses-v1"))).toBe("on");
    await expect(row.locator(".map-layer-switch").nth(2)).not.toContainText("With GO Buses");
    await liveGps.click();
    await expect(liveGps).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-go-bus-positions-v1"))).toBe("off");
    // TTC's Live GPS is its own switch.
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-streetcar-positions-v1"))).toBeNull();

    await page.locator(".desktop-map-control-network-group").getByRole("button", { name: /TTC/ }).click();
    await waitForNetworkTransition(page, "ttc");
    await expect(page.locator("#map-view-layers-row")).toHaveAttribute("data-network", "ttc");
    await expect(page.locator("#map-layer-go-bus-routes")).toHaveCount(0);
    await expect(geoMap).not.toHaveAttribute("data-go-buses", "on");
    await expect(page.locator("#map-view-layers-row .map-layer-switch-label")).toHaveText(["Train Markers", "Streetcars", "Buses", "Live GPS"]);
  });

  test("a GO route panel lists its stops, shows the route with GO Buses off, and opens a stop", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    // Plan 14, U5: the 67 calls at 00008 (Yonge St. @ Sheppard Ave.), which the stub serves.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(geoMap).toHaveAttribute("data-network", "regional");
    const mapSurface = geoMap.locator(':scope > [role="region"]');

    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("67");
    await page.locator("[data-search-group='routes'] [data-surface-route-result='regional:67']").click();
    const route = page.locator("[data-surface-route-panel='regional:67']");
    await expect(route).toContainText("Not live service.");
    await expect(route.getByRole("button", { name: /^To / }).first()).toHaveAttribute("aria-pressed", "true");

    await route.getByRole("button", { name: "View on Map" }).click();
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /selected-line/, { timeout: 15_000 });
    await expect(geoMap).not.toHaveAttribute("data-go-buses", "on");

    await route.locator("[data-surface-route-stop='00008']").click();
    const stop = page.locator("[data-go-bus-stop-panel='00008']");
    await expect(stop.locator("[data-departure-status='live']").first()).toBeVisible();
    await stop.getByRole("button", { name: /^Back to route 67 / }).click();
    await expect(route).toBeVisible();
    await expect(mapSurface).toHaveAttribute("data-surface-selection-layers", /selected-line/);
  });

  test("a GO route panel lists the route's notices, each opening its notice", async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop search entry");
    await setStubMode(request, "regional-live");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const input = page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("31");
    await page.locator("[data-search-group='routes'] [data-surface-route-result='regional:31']").click();
    const route = page.locator("[data-surface-route-panel='regional:31']");
    const notice = route.getByRole("button", { name: /Route 31 buses are detouring/ });
    await expect(notice).toBeVisible();
    // A GO train notice that shares no route stays out.
    await expect(route).not.toContainText("Barrie station construction notice");
    await notice.click();
    await expect(route).toHaveCount(0);
    await expect(page.getByText("Route 31 buses are detouring").first()).toBeVisible();
  });
});
