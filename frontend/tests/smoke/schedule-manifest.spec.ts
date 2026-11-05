import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Plan 16: with a schedule manifest, the Map View and search read the schedule-derived files
// through its hashed URLs and never the release's copies; without one (every other spec, and
// local dev), they read the release's copies. Service workers are blocked so page.route sees
// every read.

test.use({ serviceWorkers: "block" });

const GEOGRAPHIC = new URL("../../public/assets/linewatch/geographic/", import.meta.url);
const SCHEDULE_FILES = {
  ttc: [
    "ttc-surface-streetcar.json", "ttc-surface-bus.json", "ttc-surface-night.json",
    "ttc-surface-bus-stops.json", "ttc-surface-night-stops.json",
    "ttc-surface-streetcar-route-stops.json", "ttc-surface-bus-route-stops.json", "ttc-surface-night-route-stops.json",
    "search-index-ttc.json",
  ],
  go: ["go-surface-bus.json", "go-surface-bus-stops.json", "go-surface-bus-route-stops.json", "search-index-go.json"],
};
const hashed = (name: string) => `files/${name.replace(/\.json$/, "")}.0123456789abcdef.json`;

async function serveManifest(page: Page) {
  const networks = Object.fromEntries(Object.entries(SCHEDULE_FILES).map(([network, names]) => [network, {
    origin: "runtime",
    feedVersion: "test",
    feedStartDate: "2026-11-01",
    feedEndDate: "2026-12-19",
    publishedAt: "2026-11-05T17:00:00Z",
    files: Object.fromEntries(names.map((name) => [name, hashed(name)])),
  }]));
  await page.route("**/data/schedule/manifest.json", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ schemaVersion: "1.0.0", generation: "test", publishedAt: "2026-11-05T17:00:00Z", networks }),
  }));
  await page.route("**/data/schedule/files/*", (route) => {
    const file = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const name = file.replace(/\.0123456789abcdef\.json$/, ".json");
    return route.fulfill({ contentType: "application/json", body: readFileSync(new URL(name, GEOGRAPHIC)) });
  });
}

/** Paths of geographic and schedule reads, in order. */
function recordReads(page: Page) {
  const reads: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/data/schedule/") || pathname.startsWith("/assets/linewatch/geographic/")) reads.push(pathname);
  });
  return reads;
}

test.describe("Schedule manifest", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-default-network-v1", "ttc");
    });
  });

  test("the Map View and search load through the manifest's hashed files", async ({ page, isMobile }) => {
    await serveManifest(page);
    const reads = recordReads(page);
    await page.goto("/");
    await expect.poll(() => reads, { timeout: 20_000 }).toEqual(expect.arrayContaining([
      "/data/schedule/manifest.json",
      `/data/schedule/${hashed("ttc-surface-streetcar.json")}`,
      `/data/schedule/${hashed("search-index-ttc.json")}`,
      `/data/schedule/${hashed("search-index-go.json")}`,
    ]));

    const input = isMobile
      ? page.getByRole("searchbox", { name: "Station Search" })
      : page.getByPlaceholder(/Search all stations/);
    await input.click();
    await input.fill("100");
    await expect(page.locator("[data-search-group='stops']:visible [data-surface-stop-result='100']")).toBeVisible();

    const scheduleNames = new Set(Object.values(SCHEDULE_FILES).flat());
    const releaseCopies = reads.filter((path) => scheduleNames.has(path.split("/").pop() ?? ""));
    expect(releaseCopies, "no schedule-derived file comes from the release").toEqual([]);
    expect(reads.filter((path) => path === "/data/schedule/manifest.json")).toHaveLength(1);
  });

  test("without a manifest, the release's copies are used", async ({ page }) => {
    const reads = recordReads(page);
    await page.goto("/");
    await expect.poll(() => reads, { timeout: 20_000 }).toEqual(expect.arrayContaining([
      "/assets/linewatch/geographic/ttc-surface-streetcar.json",
      "/assets/linewatch/geographic/search-index-ttc.json",
    ]));
    expect(reads.filter((path) => path.startsWith("/data/schedule/files/"))).toEqual([]);
  });
});
