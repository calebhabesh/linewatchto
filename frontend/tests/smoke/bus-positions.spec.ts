import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, pressMapPoint, setStubMode } from "./test-support";

// Plan 13, S8: live bus positions on the Map View, read for the area in view from zoom 13 while
// bus routes and live vehicles are on. The bus sits on Dufferin St north of Davenport (29 and
// 929 only, no streetcar), at the centre of the saved phone camera.
const BUS = { lng: -79.44069, lat: 43.67238 };

type Vehicle = Record<string, unknown>;

function bus(overrides: Vehicle = {}): Vehicle {
  return {
    vehicleId: "8100",
    route: "29",
    routeName: "Dufferin",
    destination: "North - 29 Dufferin towards Wilson Station",
    latitude: BUS.lat,
    longitude: BUS.lng,
    bearing: 0,
    reportedAt: "2026-08-14T15:59:40Z",
    ageSeconds: 20,
    stale: false,
    replacement: false,
    ...overrides,
  };
}

function positions(overrides: { state?: string; vehicles?: Vehicle[] } = {}) {
  return {
    networkId: "ttc",
    state: "live",
    source: "TTC GTFS-RT vehicle positions",
    generatedAt: "2026-08-14T16:00:00Z",
    sourceUpdatedAt: "2026-08-14T15:59:50Z",
    maxSourceAgeSeconds: 120,
    vehicleStaleAfterSeconds: 120,
    vehicleMaxAgeSeconds: 300,
    refreshSeconds: 15,
    vehicles: [bus()],
    ...overrides,
  };
}

async function servePositions(page: Page, body: ReturnType<typeof positions>) {
  const areas: string[] = [];
  await page.route("**/api/surface/buses/positions*", async (route) => {
    areas.push(new URL(route.request().url()).searchParams.get("bbox") ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return () => areas;
}

async function openCamera(page: Page, { zoom = 16, buses = "on" }: { zoom?: number; buses?: "on" | "off" } = {}) {
  await page.addInitScript(({ bus, zoom, buses }) => {
    localStorage.setItem("linewatch-map-view-v1", "geographic");
    localStorage.setItem("linewatch-map-view-buses-v1", buses);
    localStorage.setItem("linewatch-geographic-map-viewport-v1:ttc", JSON.stringify({
      version: 2, lng: bus.lng, lat: bus.lat, zoom, savedAt: Date.now(),
    }));
  }, { bus: BUS, zoom, buses });
  await page.goto("/");
  await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

async function pressBus(page: Page) {
  const card = page.locator("[data-bus-vehicle-card]");
  // The bus draws once its first read arrives.
  await pressMapPoint(page, BUS, card);
  return card;
}

test.describe("Live bus positions on the Map View", () => {
  // Requests a service worker handles bypass page.route; this spec answers the positions read itself.
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
  });

  test("a live bus opens its card with its age and the nearest bus stop's departures", async ({ page }) => {
    const areas = await servePositions(page, positions());
    await openCamera(page);
    await expect.poll(() => areas().length, { timeout: 20_000 }).toBeGreaterThan(0);
    // Only the area around the view is asked for, and it holds the camera.
    const [west, south, east, north] = areas()[0].split(",").map(Number);
    expect(west).toBeLessThan(BUS.lng);
    expect(east).toBeGreaterThan(BUS.lng);
    expect(south).toBeLessThan(BUS.lat);
    expect(north).toBeGreaterThan(BUS.lat);
    expect(east - west).toBeLessThan(0.1);

    const card = await pressBus(page);
    await expect(card).toContainText("Live Bus");
    await expect(card).toContainText("Dufferin");
    await expect(card).toContainText("To Wilson Station");
    await expect(card.locator(".streetcar-vehicle-status")).toHaveAttribute("data-state", "live");
    await expect(card).toContainText("Live GPS · 20 s ago");
    await expect(card).toContainText("Vehicle 8100");
    await expect(card).not.toContainText("Off its mapped route");
    await expect(card).not.toContainText("Replacement bus");

    const stopButton = card.getByRole("button", { name: /Nearest Stop Departures/ });
    const stopCode = (await stopButton.locator(".streetcar-card-stop-code").textContent())?.trim();
    expect(stopCode).toMatch(/^\d+$/);
    await stopButton.click();
    await expect(card).toHaveCount(0);
    await expect(page.locator(`[data-surface-stop-panel='${stopCode}']`)).toBeVisible();
  });

  test("a replacement bus says which streetcar route it stands in for", async ({ page }) => {
    await servePositions(page, positions({ vehicles: [bus({
      vehicleId: "6725",
      route: "503",
      routeName: "Kingston Rd",
      destination: "East - 503 Kingston Rd Replacement Bus towards Victoria Park",
      replacement: true,
    })] }));
    await openCamera(page);
    const card = await pressBus(page);
    await expect(card).toContainText("Replacement bus for the 503 streetcar.");
    await expect(card).toContainText("Vehicle 6725");
  });

  test("a stale source shows the bus as stale, with its last report", async ({ page }) => {
    await servePositions(page, positions({ state: "stale", vehicles: [bus({ ageSeconds: 185, stale: true })] }));
    await openCamera(page);
    const card = await pressBus(page);
    await expect(card.locator(".streetcar-vehicle-status")).toHaveAttribute("data-state", "stale");
    await expect(card).toContainText("Stale · Last Report 3 min ago");
    await expect(card).not.toContainText("Live GPS");
    await expect(card).not.toContainText("Live Bus");
  });

  test("a disabled source draws no buses and is not asked again", async ({ page }) => {
    const areas = await servePositions(page, positions({ state: "disabled", vehicles: [] }));
    await openCamera(page);
    await expect.poll(() => areas().length, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(2_000);
    await expect(page.locator("[data-bus-vehicle-card]")).toHaveCount(0);
    expect(areas()).toHaveLength(1);
  });

  test("nothing is read with bus routes off, or below the bus zoom", async ({ page }) => {
    const areas = await servePositions(page, positions());
    await openCamera(page, { buses: "off" });
    await page.waitForTimeout(3_000);
    expect(areas()).toHaveLength(0);

    await openCamera(page, { zoom: 12.4 });
    await page.waitForTimeout(3_000);
    expect(areas()).toHaveLength(0);
  });
});
