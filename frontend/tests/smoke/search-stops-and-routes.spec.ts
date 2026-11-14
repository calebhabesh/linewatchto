import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";
import { SEARCH_PLACEHOLDER } from "../../src/app/unified-search";

// Plan 14, U8: the search paths a rider takes, on desktop and phone: a stop by
// number, a stop by its two street names in either order, and a route number.
// Stops Near Me with a mocked position is stops-near-me.spec.ts.
// The stub serves TTC departures for stop 100.

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

const stopsGroup = (page: Page) => page.locator("[data-search-group='stops']:visible");
const routesGroup = (page: Page) => page.locator("[data-search-group='routes']:visible");

test.describe("Search for stops and routes", () => {
  test.beforeEach(async ({ page, request }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-map-view-v1", "geographic");
      localStorage.setItem("linewatch-default-network-v1", "ttc");
    });
  });

  test("both search indexes load once the page idles, before search is touched", async ({ page }) => {
    const indexes: string[] = [];
    page.on("request", (request) => {
      const name = new URL(request.url()).pathname.split("/").pop() ?? "";
      if (name.startsWith("search-index-")) indexes.push(name);
    });
    await page.goto("/");
    await expect.poll(() => indexes, { timeout: 20_000 }).toEqual(["search-index-ttc.json", "search-index-go.json"]);
  });

  test("a stop number opens its departures, each labelled live or scheduled", async ({ page, isMobile }) => {
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    await input.fill("100");
    await stopsGroup(page).locator("[data-surface-stop-result='100']").click();

    const stop = page.locator("[data-surface-stop-panel='100']");
    await expect(stop).toContainText("Bathurst St at Fort York Blvd");
    await expect(stop.locator("[data-departure-status='live']")).toBeVisible();
    await expect(stop.locator("[data-departure-status='scheduled']")).toBeVisible();
    await expect(page).toHaveURL(/\?stop=100$/);
  });

  test("an intersection matches with its streets in either order, as one row of its poles", async ({ page, isMobile }) => {
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    const corner = stopsGroup(page).locator("[data-surface-stop-group^='ttc:dufferin st | king st']");

    for (const query of ["dufferin king", "king and dufferin"]) {
      await input.fill(query);
      await expect(corner).toHaveCount(1);
      await expect(corner).toContainText("Dufferin St at King St West");
      await expect(corner).toHaveAttribute("aria-label", /2 stops, routes 29\b/);
    }

    await corner.click();
    await expect(corner).toHaveAttribute("aria-expanded", "true");
    await expect(stopsGroup(page).locator("[data-surface-stop-result='2066']")).toBeVisible();
    await expect(stopsGroup(page).locator("[data-surface-stop-result='2067']")).toBeVisible();

    // A corner's pole opens that pole's departures.
    await input.fill("bathurst at fort york");
    const fortYork = stopsGroup(page).locator("[data-surface-stop-group^='ttc:bathurst st | fort york blvd']");
    await fortYork.click();
    await stopsGroup(page).locator("[data-surface-stop-result='100']").click();
    await expect(page.locator("[data-surface-stop-panel='100'] [data-departure-status='live']")).toBeVisible();
  });

  test("a route number puts the route first and opens its panel with stops by direction", async ({ page, isMobile }) => {
    await page.goto("/");
    const input = await openSearch(page, isMobile);
    await input.fill("504");
    const routeRow = routesGroup(page).locator("[data-surface-route-result='ttc:504']");
    await expect(routeRow).toBeVisible();
    // An exact route number outranks the stop numbered 504.
    const groups = page.locator(".station-search-results:visible [data-search-group]");
    await expect(groups.first()).toHaveAttribute("data-search-group", "routes");

    await routeRow.click();
    const route = page.locator("[data-surface-route-panel='ttc:504']");
    await expect(route).toBeVisible();
    await expect(route).toContainText("King");
    await expect(route.locator("[data-route-direction]")).toHaveCount(1);
    expect(await route.locator("[data-surface-route-stop]").count()).toBeGreaterThan(10);
  });
});
