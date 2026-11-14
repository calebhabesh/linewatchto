import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";
import { SEARCH_PLACEHOLDER } from "../../src/app/unified-search";

// Plan 14, U7: Back from a stop or route opened in search returns to the
// results with the query, scroll and row kept, and ?stop= links open a stop.
// The stub serves TTC departures for stops 100 and 2034 and GO stop 00008.
const STOP_100 = { latitude: 43.638947, longitude: -79.400771, accuracy: 12 };

// Count departure reads from the page itself.
test.use({ serviceWorkers: "block" });

function searchInput(page: Page, isMobile: boolean) {
  return isMobile
    ? page.getByRole("searchbox", { name: "Station Search" })
    : page.getByPlaceholder(SEARCH_PLACEHOLDER, { exact: true });
}

async function openSearch(page: Page, isMobile: boolean) {
  const input = searchInput(page, isMobile);
  await input.click();
  return input;
}

const results = (page: Page) => page.locator(".station-search-results:visible");

test.describe("Back to search and stop links", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-default-network-v1", "ttc");
    });
  });

  test("a stop from search: its Back row and browser Back return to the results, query, scroll and row kept", async ({ page, isMobile }) => {
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    await input.fill("dufferin");
    await page.locator("[data-search-group='stops']:visible").getByRole("button", { name: /Show All Stops/ }).click();
    const row = results(page).locator("[data-surface-stop-result='983']");
    await row.scrollIntoViewIfNeeded();
    const scrollTop = await results(page).evaluate((element) => element.scrollTop);
    expect(scrollTop).toBeGreaterThan(100);

    await row.click();
    const stop = page.locator("[data-surface-stop-panel='983']");
    await expect(stop).toBeVisible();
    await expect(page).toHaveURL(/\?stop=983$/);
    const back = stop.getByRole("button", { name: "Back to search results for dufferin" });
    await expect(back).toContainText("Results for “dufferin”");

    // The Back row.
    await back.click();
    await expect(stop).toHaveCount(0);
    await expect(input).toHaveValue("dufferin");
    await expect(row).toBeInViewport();
    await expect(row).toBeFocused();
    await expect.poll(() => results(page).evaluate((element) => element.scrollTop)).toBeCloseTo(scrollTop, -1);
    await expect(page).not.toHaveURL(/stop=/);

    // Browser (or Android) Back does the same, Show All included.
    await row.click();
    await expect(stop).toBeVisible();
    await page.goBack();
    await expect(stop).toHaveCount(0);
    await expect(input).toHaveValue("dufferin");
    await expect(row).toBeInViewport();
    await expect.poll(() => results(page).evaluate((element) => element.scrollTop)).toBeCloseTo(scrollTop, -1);

    // Closing a stop closes the way back with it.
    await row.click();
    await stop.getByRole("button", { name: "Close stop departures" }).click();
    await expect(stop).toHaveCount(0);
    await expect(page).not.toHaveURL(/stop=/);
    await expect(page.locator("#station-search-panel[data-open='true']")).toHaveCount(0);
  });

  test("route panel → stop → Back, then Back to search", async ({ page, isMobile }) => {
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    await input.fill("29");
    await page.locator("[data-search-group='routes']:visible [data-surface-route-result='ttc:29']").click();
    const route = page.locator("[data-surface-route-panel='ttc:29']");
    await expect(route).toBeVisible();
    await expect(route.getByRole("button", { name: "Back to search results for 29" })).toBeVisible();

    await route.locator("[data-surface-route-stop='2034']").click();
    const stop = page.locator("[data-surface-stop-panel='2034']");
    await expect(stop.locator("[data-departure-status]").first()).toBeVisible();
    // One step at a time: the stop goes back to its route, not to search.
    await expect(stop.getByRole("button", { name: "Back to route 29 Dufferin" })).toBeVisible();
    await expect(stop.locator("[data-search-back]")).toHaveCount(0);

    await page.goBack();
    await expect(stop).toHaveCount(0);
    await expect(route).toBeVisible();
    await expect(route.locator("[data-surface-route-stop='2034']")).toBeInViewport();

    // The Back row this time.
    await route.locator("[data-surface-route-stop='2034']").click();
    await stop.getByRole("button", { name: "Back to route 29 Dufferin" }).click();
    await expect(route).toBeVisible();

    await page.goBack();
    await expect(route).toHaveCount(0);
    await expect(input).toHaveValue("29");
    await expect(page.locator("[data-search-group='routes']:visible [data-surface-route-result='ttc:29']")).toBeVisible();
  });

  test("Stops Near Me and Recent Stops rows: Back returns to the list", async ({ page, context, isMobile }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(STOP_100);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-recent-stops-v1", JSON.stringify([{ network: "ttc", code: "2034" }]));
    });
    await page.goto("/");
    await openSearch(page, isMobile);
    const nearMe = page.locator("[data-stops-near-me]:visible");
    await nearMe.getByRole("button", { name: /Stops Near Me/ }).click();
    await expect(nearMe).toHaveAttribute("data-stops-near-me", "ready");

    await nearMe.locator("[data-near-me-stop='100']").click();
    const stop100 = page.locator("[data-surface-stop-panel='100']");
    await expect(stop100.locator("[data-departure-status='live']")).toBeVisible();
    await stop100.getByRole("button", { name: "Back to search" }).click();
    await expect(stop100).toHaveCount(0);
    // The list is still there; nothing asks for location again.
    await expect(nearMe).toHaveAttribute("data-stops-near-me", "ready");
    await expect(nearMe.locator("[data-near-me-stop='100']")).toBeFocused();

    await nearMe.locator("[data-recent-stop='2034']").click();
    const stop2034 = page.locator("[data-surface-stop-panel='2034']");
    await expect(stop2034).toBeVisible();
    await expect(stop2034.locator("[data-search-back]")).toContainText("Stops Near Me and Recent Stops");
    await page.goBack();
    await expect(stop2034).toHaveCount(0);
    await expect(nearMe.locator("[data-recent-stop='2034']")).toBeVisible();
  });

  test("a stop link opens that TTC stop on the Map View, never asks for location, and leaves on close", async ({ page }) => {
    await page.addInitScript(() => {
      const calls = { count: 0 };
      (window as unknown as { __geolocationCalls: typeof calls }).__geolocationCalls = calls;
      const geolocation = navigator.geolocation;
      geolocation.getCurrentPosition = () => { calls.count += 1; };
      geolocation.watchPosition = () => { calls.count += 1; return 0; };
      // The saved view is a System Map; a stop link shows the Map View.
      localStorage.setItem("linewatch-map-view-v1", "diagram");
    });
    await page.goto("/?stop=100");
    const stop = page.locator("[data-surface-stop-panel='100']");
    await expect(stop.locator("[data-departure-status='live']")).toBeVisible();
    await expect(stop.locator("[data-search-back]")).toHaveCount(0);
    await expect(page).toHaveURL(/\?stop=100$/);
    expect(await page.evaluate(() => localStorage.getItem("linewatch-map-view-v1"))).toBe("geographic");
    expect(await page.evaluate(() => (window as unknown as { __geolocationCalls: { count: number } }).__geolocationCalls.count)).toBe(0);

    // A reload keeps the stop: the address is its link.
    await page.reload();
    await expect(stop.locator("[data-departure-status='live']")).toBeVisible();
    await stop.getByRole("button", { name: "Close stop departures" }).click();
    await expect(stop).toHaveCount(0);
    await expect(page).not.toHaveURL(/stop=/);
  });

  test("a GO stop link switches network and accepts the number without leading zeros", async ({ page }) => {
    await page.goto("/?network=regional&stop=8");
    const stop = page.locator("[data-go-bus-stop-panel='00008']");
    await expect(stop.locator("[data-departure-status]").first()).toBeVisible();
    await expect(page).toHaveURL(/network=regional&stop=00008$/);
  });

  test("an unknown or malformed stop link says so, and a malformed one asks nothing", async ({ page }) => {
    const reads: string[] = [];
    page.on("request", (request) => {
      const match = new URL(request.url()).pathname.match(/^\/api\/surface\/stops\/([^/]+)\/arrivals$/);
      if (match) reads.push(decodeURIComponent(match[1]));
    });
    await page.goto("/?stop=424242");
    await expect(page.locator("[data-surface-stop-panel='424242']")).toContainText("Stop 424242 is not in the TTC stop list");

    await page.goto("/?stop=%3Cb%3E7658");
    const malformed = page.locator("[data-surface-stop-panel='<b>7658']");
    await expect(malformed).toContainText("Stop <b>7658 is not in the TTC stop list");
    expect(reads).toEqual(["424242"]);
    // Only stop numbers go to Recent Stops.
    const recent = await page.evaluate(() => localStorage.getItem("linewatch-recent-stops-v1"));
    expect(JSON.parse(recent ?? "[]")).toEqual([{ network: "ttc", code: "424242" }]);
  });
});
