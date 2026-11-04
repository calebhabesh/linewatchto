import { test, expect } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

// Plan 13, S5: TTC buses on the Map View behind a toggle, off by default and
// remembered on the device. Stop 11630 (Dufferin Mall) is a bus-only stop.
const STOP = { code: "11630", lng: -79.43403, lat: 43.65579 };

test.use({ serviceWorkers: "block" });

test.describe("TTC buses on the Map View", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript((stop) => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-geographic-map-viewport-v1:ttc", JSON.stringify({
        version: 2, lng: stop.lng, lat: stop.lat, zoom: 17, savedAt: Date.now(),
      }));
    }, STOP);
  });

  test("the phone toggle is off by default, remembered, and opens bus stops", async ({ page, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    const assets: string[] = [];
    page.on("request", (request) => {
      if (/ttc-surface-bus/.test(request.url())) assets.push(request.url().split("/").pop() ?? "");
    });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const toggle = page.locator(".mobile-bus-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(geoMap).not.toHaveAttribute("data-buses", "on");
    expect(assets, "nothing loads while buses are off").toEqual([]);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toContainText("Viewing");
    await expect(geoMap).toHaveAttribute("data-buses", "on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-buses-v1"))).toBe("on");

    await page.reload();
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator(".mobile-bus-toggle")).toHaveAttribute("aria-pressed", "true");

    // The bus stop sits at the centre of the saved camera; press it until its departures open.
    const canvas = geoMap.locator("canvas");
    const panel = page.locator(`[data-surface-stop-panel="${STOP.code}"]`);
    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      if (!box) return false;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return panel.isVisible();
    }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
    expect(assets).toContain("ttc-surface-bus.json");
    expect(assets).toContain("ttc-surface-bus-stops.json");
    await panel.getByRole("button", { name: "Close stop departures" }).click();

    await page.locator(".mobile-bus-toggle").click();
    await expect(geoMap).not.toHaveAttribute("data-buses", "on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-buses-v1"))).toBe("off");
  });

  test("the desktop toolbar's layer row switches buses and streetcars; TTC buses stay on TTC", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop toolbar");
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto("/");
    const geoMap = page.locator(".geographic-network-map");
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    const row = page.locator("#map-view-layers-row");
    await expect(row).toBeVisible();
    // Trains (estimated markers, the same setting as the Train Markers switch), streetcar routes, bus routes,
    // and live GPS (streetcars, and buses while bus routes are on; S8).
    await expect(row.locator(".map-layer-switch")).toHaveCount(4);
    await expect(row.locator(".map-layer-switch-label")).toHaveText(["Train Markers", "Streetcars", "Buses", "Live GPS"]);
    await expect(row.getByRole("switch", { name: /Toggle estimated train markers/ })).toBeVisible();
    await expect(page.locator(".desktop-train-toggle-btn")).toBeHidden();

    const buses = row.locator("#map-layer-bus-routes");
    await expect(buses).toHaveAttribute("aria-checked", "false");
    await buses.click();
    await expect(geoMap).toHaveAttribute("data-buses", "on");
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-buses-v1"))).toBe("on");

    await row.locator("#map-layer-streetcar-routes").click();
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-streetcars-v1"))).toBe("off");
    await row.locator("#map-layer-streetcar-routes").click();

    await page.getByRole("button", { name: /GO\/UP/ }).first().click();
    await waitForNetworkTransition(page, "regional");
    // GO/UP has its own deck (S6; Live GPS for GO buses in S9), never TTC buses.
    await expect(page.locator("#map-view-layers-row .map-layer-switch-label")).toHaveText(["Train Markers", "GO Buses", "Live GPS"]);
    await expect(page.locator("#map-layer-bus-routes")).toHaveCount(0);
    await expect(page.locator(".geographic-network-map")).not.toHaveAttribute("data-buses", "on");
  });
});
