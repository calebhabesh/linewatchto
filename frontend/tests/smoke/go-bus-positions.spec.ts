import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Plan 13, S9: live GO bus positions on the GO/UP Map View, read for the area in view from
// zoom 10 while GO Buses and the GO/UP Live GPS switch are on. The bus is on Yonge St at
// Sheppard (GO stop 00008, routes 19, 27, 67 and 96), at the centre of the saved phone camera.
const BUS = { lng: -79.41119, lat: 43.7616 };

type Vehicle = Record<string, unknown>;

function bus(overrides: Vehicle = {}): Vehicle {
  return {
    vehicleId: "2551",
    tripId: "20260814-96-9601",
    route: "96",
    destination: "Finch Bus Terminal",
    latitude: BUS.lat,
    longitude: BUS.lng,
    reportedAt: "2026-08-14T15:59:40Z",
    ageSeconds: 20,
    stale: false,
    nextStopCode: "00008",
    ...overrides,
  };
}

function positions(overrides: { state?: string; vehicles?: Vehicle[] } = {}) {
  return {
    networkId: "regional",
    state: "live",
    source: "Metrolinx GO GTFS-RT VehiclePosition",
    generatedAt: "2026-08-14T16:00:00Z",
    sourceUpdatedAt: "2026-08-14T15:59:55Z",
    maxSourceAgeSeconds: 120,
    vehicleStaleAfterSeconds: 300,
    vehicleMaxAgeSeconds: 900,
    refreshSeconds: 15,
    vehicles: [bus()],
    ...overrides,
  };
}

async function servePositions(page: Page, body: ReturnType<typeof positions>) {
  const areas: string[] = [];
  const ttcReads: string[] = [];
  await page.route("**/api/regional/buses/positions*", async (route) => {
    areas.push(new URL(route.request().url()).searchParams.get("bbox") ?? "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  page.on("request", (request) => {
    if (/\/api\/surface\/(buses|streetcars)\/positions/.test(request.url())) ttcReads.push(request.url());
  });
  return { areas: () => areas, ttcReads: () => ttcReads };
}

async function openCamera(
  page: Page,
  { zoom = 15, goBuses = "on", live }: { zoom?: number; goBuses?: "on" | "off"; live?: "on" | "off" } = {},
) {
  await page.addInitScript(({ bus, zoom, goBuses, live }) => {
    localStorage.setItem("linewatch-map-view-v1", "geographic");
    localStorage.setItem("linewatch-default-network-v1", "regional");
    localStorage.setItem("linewatch-map-view-go-buses-v1", goBuses);
    if (live) localStorage.setItem("linewatch-map-view-go-bus-positions-v1", live);
    localStorage.setItem("linewatch-geographic-map-viewport-v1:regional", JSON.stringify({
      version: 2, lng: bus.lng, lat: bus.lat, zoom, savedAt: Date.now(),
    }));
  }, { bus: BUS, zoom, goBuses, live });
  await page.goto("/");
  const geoMap = page.locator(".geographic-network-map");
  await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
  await expect(geoMap).toHaveAttribute("data-network", "regional");
}

async function pressBus(page: Page) {
  const card = page.locator("[data-go-bus-vehicle-card]");
  const canvas = page.locator(".geographic-network-map canvas");
  await expect.poll(async () => {
    const stopPanel = page.locator("[data-go-bus-stop-panel]");
    if (await stopPanel.isVisible()) {
      await stopPanel.getByRole("button", { name: /Close/ }).first().click();
      await expect(stopPanel).toHaveCount(0);
    }
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    return card.isVisible();
  }, { timeout: 20_000, intervals: [1_000] }).toBe(true);
  return card;
}

test.describe("Live GO bus positions on the GO/UP Map View", () => {
  // Requests a service worker handles bypass page.route; this spec answers the positions read itself.
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "The saved Map View camera is restored on phones");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
  });

  test("a live GO bus opens its card with its age, route and next stop's departures", async ({ page }) => {
    const reads = await servePositions(page, positions());
    await openCamera(page);
    await expect.poll(() => reads.areas().length, { timeout: 20_000 }).toBeGreaterThan(0);
    const [west, south, east, north] = reads.areas()[0].split(",").map(Number);
    expect(west).toBeLessThan(BUS.lng);
    expect(east).toBeGreaterThan(BUS.lng);
    expect(south).toBeLessThan(BUS.lat);
    expect(north).toBeGreaterThan(BUS.lat);

    const card = await pressBus(page);
    await expect(card).toContainText("Live GO Bus");
    await expect(card).toContainText("Oshawa / Finch Express");
    await expect(card).toContainText("Finch Bus Terminal");
    await expect(card.locator(".streetcar-vehicle-status")).toHaveAttribute("data-state", "live");
    await expect(card).toContainText("Live GPS · 20 s ago");
    await expect(card).toContainText("Vehicle 2551");
    await expect(card).toContainText("Metrolinx GO bus GPS");
    expect(reads.ttcReads(), "GO/UP never reads TTC vehicle positions").toEqual([]);

    const stopButton = card.getByRole("button", { name: /Next Stop Departures/ });
    await expect(stopButton.locator(".streetcar-card-stop-code")).toHaveText("00008");
    await stopButton.click();
    await expect(card).toHaveCount(0);
    await expect(page.locator("[data-go-bus-stop-panel='00008']")).toBeVisible();
  });

  test("a stale source shows the GO bus as stale, with its last report", async ({ page }) => {
    await servePositions(page, positions({ state: "stale", vehicles: [bus({ ageSeconds: 400, stale: true })] }));
    await openCamera(page);
    const card = await pressBus(page);
    await expect(card.locator(".streetcar-vehicle-status")).toHaveAttribute("data-state", "stale");
    await expect(card).toContainText("Stale · Last Report 6 min ago");
    await expect(card).not.toContainText("Live GO Bus");
  });

  test("a disabled source draws no buses and is not asked again", async ({ page }) => {
    const reads = await servePositions(page, positions({ state: "disabled", vehicles: [] }));
    await openCamera(page);
    await expect.poll(() => reads.areas().length, { timeout: 20_000 }).toBe(1);
    await page.waitForTimeout(2_000);
    await expect(page.locator("[data-go-bus-vehicle-card]")).toHaveCount(0);
    expect(reads.areas()).toHaveLength(1);
  });

  test("nothing is read with GO buses off, Live GPS off, or below the GO bus zoom", async ({ page }) => {
    const reads = await servePositions(page, positions());
    await openCamera(page, { goBuses: "off" });
    await page.waitForTimeout(3_000);
    expect(reads.areas()).toHaveLength(0);

    await openCamera(page, { live: "off" });
    await page.waitForTimeout(3_000);
    expect(reads.areas()).toHaveLength(0);

    await openCamera(page, { zoom: 9.4, live: "on" });
    await page.waitForTimeout(3_000);
    expect(reads.areas()).toHaveLength(0);
  });
});
