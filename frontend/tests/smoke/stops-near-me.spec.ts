import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Plan 14, U6: Stops Near Me with a mocked position (never a real one), and Recent Stops.
// Stop 100 (Bathurst St at Fort York Blvd) and GO stop 00008 (Yonge St. @ Sheppard Ave.)
// have stub departures.
const STOP_100 = { latitude: 43.638947, longitude: -79.400771, accuracy: 12 };
const GO_00008 = { latitude: 43.7616, longitude: -79.41119, accuracy: 12 };
// Lake Ontario, well over 1 km from any stop.
const IN_THE_LAKE = { latitude: 43.55, longitude: -79.4, accuracy: 12 };

// Count departure reads from the page itself.
test.use({ serviceWorkers: "block" });

async function openSearch(page: Page, isMobile: boolean) {
  const input = isMobile
    ? page.getByRole("searchbox", { name: "Station Search" })
    : page.getByPlaceholder(/Search all stations/);
  await input.click();
  return input;
}

const nearMe = (page: Page) => page.locator("[data-stops-near-me]:visible");

test.describe("Stops Near Me and Recent Stops", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-default-network-v1", "ttc");
    });
  });

  test("lists nearby stops with distance and labelled times, caps requests, and remembers the stop opened", async ({ page, context, isMobile }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(STOP_100);
    const departureReads: string[] = [];
    page.on("request", (request) => {
      const match = new URL(request.url()).pathname.match(/^\/api\/surface\/stops\/([^/]+)\/arrivals$/);
      if (match) departureReads.push(match[1]);
    });
    await page.goto("/");
    await openSearch(page, isMobile);

    const section = nearMe(page);
    await expect(section).toHaveAttribute("data-stops-near-me", "idle");
    // Nothing is asked for until the tap.
    expect(departureReads).toEqual([]);
    await section.getByRole("button", { name: /Stops Near Me/ }).click();
    await expect(section).toHaveAttribute("data-stops-near-me", "ready");

    const rows = section.locator("[data-near-me-stop]");
    await expect(rows.first()).toHaveAttribute("data-near-me-stop", "100");
    expect(await rows.count()).toBeLessThanOrEqual(8);
    const first = rows.first();
    await expect(first).toContainText("TTC");
    await expect(first).toContainText("10 m");
    // Every time says live or scheduled.
    await expect(first.locator("[data-departure-status='live']")).toContainText("4 min");
    await expect(first.locator("[data-departure-status='scheduled']").first()).toBeVisible();
    await expect(first).toHaveAttribute("aria-label", /live estimate/);

    // Only the nearest three asked for departures, and tapping again reuses them.
    await expect.poll(() => departureReads.length).toBe(3);
    expect(departureReads[0]).toBe("100");
    await section.getByRole("button", { name: /Stops Near Me/ }).click();
    await expect(section).toHaveAttribute("data-stops-near-me", "ready");
    await page.waitForTimeout(500);
    expect(departureReads).toHaveLength(3);
    await expect(rows.nth(3).locator("[data-departure-status]")).toHaveCount(0);

    await first.click();
    await expect(page.locator("[data-surface-stop-panel='100'] [data-departure-status='live']")).toBeVisible();
    await page.locator("[data-surface-stop-panel='100']").getByRole("button", { name: "Close stop departures" }).click();

    // Recent Stops survives a reload: stop numbers and networks only, never a position.
    await page.reload();
    await openSearch(page, isMobile);
    await expect(nearMe(page).locator("[data-recent-stop='100']")).toContainText("Bathurst St at Fort York Blvd");
    const stored = await page.evaluate(() => localStorage.getItem("linewatch-recent-stops-v1"));
    expect(JSON.parse(stored ?? "[]")).toEqual([{ network: "ttc", code: "100" }]);
  });

  test("lists the other network's stops with this one's, and opening one switches network", async ({ page, context, isMobile }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(GO_00008);
    await page.goto("/");
    await openSearch(page, isMobile);
    const section = nearMe(page);
    await section.getByRole("button", { name: /Stops Near Me/ }).click();

    const goRow = section.locator("[data-near-me-stop='00008'][data-surface-stop-network='regional']");
    await expect(goRow).toContainText("GO");
    await expect(goRow.locator("[data-departure-status='live']")).toContainText("7 min");
    await expect(section.locator("[data-surface-stop-network='ttc']").first()).toBeVisible();

    await goRow.click();
    await expect(page.locator("[data-go-bus-stop-panel='00008'] [data-departure-status='live']")).toBeVisible();
  });

  test("a route panel marks the stop nearest the rider while the list is showing", async ({ page, context, isMobile }) => {
    test.skip(isMobile, "Desktop search entry; the phone route flow is U7");
    // Dufferin St at College St (2034), a pole on the 29.
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 43.65266, longitude: -79.43266, accuracy: 12 });
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    await nearMe(page).getByRole("button", { name: /Stops Near Me/ }).click();
    await expect(nearMe(page).locator("[data-near-me-stop]").first()).toHaveAttribute("data-near-me-stop", "2034");

    await input.fill("29");
    await page.locator("[data-search-group='routes'] [data-surface-route-result='ttc:29']").click();
    const route = page.locator("[data-surface-route-panel='ttc:29']");
    await expect(route.locator("li[data-nearest='true']")).toHaveCount(1);
    await expect(route.locator("li[data-nearest='true'] [data-surface-route-stop]")).toHaveAttribute("data-surface-route-stop", "2034");
    await expect(route.locator("[data-surface-route-stop='2034']")).toHaveAttribute("aria-label", /nearest to you/);
  });

  test("denied location says how to allow it, and search still works", async ({ page, isMobile }) => {
    // No geolocation permission: the browser refuses.
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    const section = nearMe(page);
    await section.getByRole("button", { name: /Stops Near Me/ }).click();
    await expect(section).toHaveAttribute("data-stops-near-me", "denied");
    await expect(section.getByRole("status")).toContainText("allow location for this site");
    await expect(section.locator("[data-near-me-stop]")).toHaveCount(0);

    await input.fill("100");
    await expect(page.locator("[data-search-group='stops'] [data-surface-stop-result='100']:visible")).toBeVisible();
  });

  test("nothing within 1 km says so", async ({ page, context, isMobile }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(IN_THE_LAKE);
    await page.goto("/");
    await openSearch(page, isMobile);
    const section = nearMe(page);
    await section.getByRole("button", { name: /Stops Near Me/ }).click();
    await expect(section).toHaveAttribute("data-stops-near-me", "ready");
    await expect(section.getByRole("status")).toHaveText("No TTC or GO stops within 1 km of you.");
    await expect(section.locator("[data-near-me-stop]")).toHaveCount(0);
  });
});
