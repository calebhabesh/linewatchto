import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, pressMapPoint, setStubMode } from "./test-support";

// Plan 13, S4: live streetcar positions on the Map View, with their age and stale state.
// The car sits on King St West (504 only), at the centre of the saved phone camera.
const CAR = { lng: -79.38825, lat: 43.64695 };

function positions(overrides: { state?: string; vehicles?: unknown[] } = {}) {
  return {
    networkId: "ttc",
    state: "live",
    source: "TTC GTFS-RT vehicle positions",
    generatedAt: "2026-08-14T16:00:00Z",
    sourceUpdatedAt: "2026-08-14T15:59:40Z",
    maxSourceAgeSeconds: 120,
    vehicleStaleAfterSeconds: 120,
    vehicleMaxAgeSeconds: 300,
    refreshSeconds: 15,
    vehicles: [{
      vehicleId: "4508",
      route: "504",
      routeName: "King",
      destination: "East - 504 King towards Broadview Station",
      latitude: CAR.lat,
      longitude: CAR.lng,
      bearing: 70,
      reportedAt: "2026-08-14T15:59:20Z",
      ageSeconds: 40,
      stale: false,
    }],
    ...overrides,
  };
}

async function servePositions(page: Page, body: ReturnType<typeof positions>) {
  let requests = 0;
  await page.route("**/api/surface/streetcars/positions", async (route) => {
    requests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return () => requests;
}

test.describe("Live streetcar positions on the Map View", () => {
  // Requests a service worker handles bypass page.route; this spec answers the positions read itself.
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript((car) => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-geographic-map-viewport-v1:ttc", JSON.stringify({
        version: 2, lng: car.lng, lat: car.lat, zoom: 16, savedAt: Date.now(),
      }));
    }, CAR);
  });

  test("a live car opens its card with its age, and the nearest stop's departures", async ({ page }) => {
    const requests = await servePositions(page, positions());
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect.poll(requests, { timeout: 20_000 }).toBeGreaterThan(0);

    const card = page.locator("[data-streetcar-vehicle-card]");
    // The car draws once the streetcar asset and its first read arrive.
    await pressMapPoint(page, CAR, card);

    await expect(card).toContainText("Live Streetcar");
    await expect(card).toContainText("King");
    await expect(card).toContainText("To Broadview Station");
    await expect(card.locator(".streetcar-vehicle-status")).toHaveAttribute("data-state", "live");
    await expect(card).toContainText("Live GPS · 40 s ago");
    await expect(card).toContainText("Vehicle 4508");
    await expect(card).not.toContainText("Off its mapped route");

    // The nearest stop on the car's route opens its departures (S3).
    const stopButton = card.getByRole("button", { name: /Nearest Stop Departures/ });
    const stopCode = (await stopButton.locator(".streetcar-card-stop-code").textContent())?.trim();
    expect(stopCode).toMatch(/^\d+$/);
    await stopButton.click();
    await expect(card).toHaveCount(0);
    await expect(page.locator(`[data-surface-stop-panel='${stopCode}']`)).toBeVisible();
  });

  test("a stale source shows the car as stale, with its last report", async ({ page }) => {
    const body = positions({ state: "stale" });
    (body.vehicles[0] as { ageSeconds: number; stale: boolean }).ageSeconds = 185;
    (body.vehicles[0] as { ageSeconds: number; stale: boolean }).stale = true;
    const requests = await servePositions(page, body);
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect.poll(requests, { timeout: 20_000 }).toBeGreaterThan(0);

    const card = page.locator("[data-streetcar-vehicle-card]");
    await pressMapPoint(page, CAR, card);
    await expect(card.locator(".streetcar-vehicle-status")).toHaveAttribute("data-state", "stale");
    await expect(card).toContainText("Stale · Last Report 3 min ago");
    await expect(card).not.toContainText("Live GPS");
    await expect(card).not.toContainText("Live Streetcar");
  });

  test("a disabled source draws no cars and is not asked again", async ({ page }) => {
    const requests = await servePositions(page, positions({ state: "disabled", vehicles: [] }));
    await page.goto("/");
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect.poll(requests, { timeout: 20_000 }).toBeGreaterThan(0);

    // Where the car would be, the press reaches what is drawn under it (a stop pill or
    // the King St line), never a car's card.
    await pressMapPoint(page, CAR, page.locator("[data-surface-stop-panel], [data-streetcar-card]").first());
    await expect(page.locator("[data-streetcar-vehicle-card]")).toHaveCount(0);
    expect(requests()).toBe(1);
  });
});
