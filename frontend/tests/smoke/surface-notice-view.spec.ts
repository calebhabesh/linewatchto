import { test, expect, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";
import { SEARCH_PLACEHOLDER } from "../../src/app/unified-search";

// Plan 15, L4: View on surface notices, and phone Back on the Layers sheet.
// TTC notices are stubbed per test; the GO/UP stub serves a rail notice and a
// GO Bus 31 notice.
test.use({ serviceWorkers: "block" });

const baseNotice = {
  category: "detour",
  routeType: "Bus",
  description: "",
  location: "",
  direction: null,
  cause: null,
  startAt: null,
  endAt: null,
  updatedAt: "2026-07-30T13:55:00Z",
  url: null,
  source: "TTC Live Alerts + GTFS-RT",
};

const TWO_STOPS = {
  ...baseNotice,
  id: "two-stops",
  routeIds: ["41"],
  title: "41 Keele: Detour via Sheppard",
  stopIds: ["7897", "11321"],
  stops: [
    { stopId: "7897", stopName: "Keele St at Sheppard Ave West North Side" },
    { stopId: "11321", stopName: "Keele St at Finch Ave West - Finch West Station" },
  ],
};
const ONE_STOP = {
  ...baseNotice,
  id: "one-stop",
  routeIds: ["29"],
  title: "29 Dufferin: Buses not stopping at College",
  stopIds: ["2034"],
  stops: [{ stopId: "2034", stopName: "Dufferin St at College St" }],
};
const ROUTE_ONLY = { ...baseNotice, id: "route-only", routeIds: ["29C"], title: "29 Dufferin: Temporary route change", stopIds: [], stops: [] };
const NOT_DRAWN = { ...baseNotice, id: "not-drawn", routeType: "Streetcar", routeIds: ["503"], title: "503 Kingston Rd: Route change", stopIds: [], stops: [] };
const SEVERAL_ROUTES = { ...baseNotice, id: "several-routes", routeIds: ["29C", "329", "504"], title: "Route changes for track work", stopIds: [], stops: [] };
// Enough rows that the list has to scroll.
const FILLER = Array.from({ length: 12 }, (_, index) => ({
  ...baseNotice,
  id: `filler-${index}`,
  routeIds: [String(100 + index)],
  title: `Filler notice ${index}`,
  description: "Long enough to take up room in the list so that it scrolls well past the fold on any size of screen.",
  stopIds: [],
  stops: [],
}));

async function stubTtcNotices(page: Page, notices: object[]) {
  await page.route((url) => url.pathname === "/api/surface-notices" && url.searchParams.get("network") !== "regional", (route) => route.fulfill({
    headers: { "Access-Control-Allow-Origin": "*" },
    json: { generatedAt: "2026-07-30T14:00:00Z", fresh: true, source: "TTC Live Alerts + GTFS-RT", categories: [], notices },
  }));
}

async function openMap(page: Page, network: "ttc" | "regional", view = "geographic") {
  await page.addInitScript(({ network, view }) => {
    localStorage.setItem("linewatch-default-network-v1", network);
    localStorage.setItem("linewatch-map-view-v1", view);
  }, { network, view });
  await page.goto("/");
  const geoMap = page.locator(".geographic-network-map");
  if (view === "geographic") {
    await expect(geoMap).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(geoMap).toHaveAttribute("data-network", network);
  }
  return geoMap;
}

const list = (page: Page) => page.locator(".surface-notices-scroll");
const action = (page: Page, id: string) => page.locator(`[data-notice-map-action="${id}"] button.impact-card-map-btn`);
const strip = (page: Page) => page.locator("[data-surface-notice-strip]");
const mapSurface = (page: Page) => page.locator(".geographic-network-map > [role='region']");

async function openNotices(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.getByRole("region", { name: "Current service status" }).getByRole("button", { name: /Notices/ }).first().click();
  } else {
    await page.locator('[data-dest="surface-notices"]').click();
  }
  await expect(list(page)).toBeVisible();
}

const camera = (page: Page) => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera() ?? null);

test.describe("Notice View", () => {
  test.beforeEach(async ({ page, request, isMobile }) => {
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("stops: selects and frames them with Buses off, nothing else draws, and Back returns to the list where it was", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [...FILLER.slice(0, 6), TWO_STOPS, ...FILLER.slice(6), NOT_DRAWN]);
    const geoMap = await openMap(page, "ttc");
    await openNotices(page, isMobile);

    const view = action(page, "two-stops");
    await expect(view).toHaveText("View");
    await expect(view).toBeEnabled();
    const before = await camera(page);
    await action(page, "two-stops").click();

    // Only the selection's layers draw; the Buses switch stays off.
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-stops/, { timeout: 15_000 });
    await expect(geoMap).not.toHaveAttribute("data-buses", "on");
    const layers = await mapSurface(page).getAttribute("data-surface-selection-layers");
    expect(layers).not.toMatch(/detour|alert|service/);
    await expect.poll(async () => {
      const current = await camera(page);
      // Between the two poles on Keele St.
      return Boolean(current && before && current.zoom > before.zoom
        && Math.abs(current.lng - -79.487) < 0.02 && Math.abs(current.lat - 43.76) < 0.02);
    }, { timeout: 15_000 }).toBe(true);

    if (isMobile) {
      await expect(list(page)).toHaveCount(0);
      await expect(strip(page)).toContainText("41");
      await expect(strip(page)).toContainText(TWO_STOPS.title);
      await strip(page).getByRole("button", { name: /Back to notices/ }).click();
      await expect(list(page)).toBeVisible();
    } else {
      await expect(strip(page)).toBeHidden();
      await expect(action(page, "two-stops")).toHaveText("Back");
      await action(page, "two-stops").click();
      await expect(action(page, "two-stops")).toHaveText("View");
    }

    await expect(mapSurface(page)).not.toHaveAttribute("data-surface-selection-layers");
    await expect(action(page, "two-stops")).toHaveText("View");
    await expect(action(page, "two-stops")).toBeFocused();
  });

  test("Back returns to the list at the same scroll position, with its filters", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [TWO_STOPS, ...FILLER]);
    await openMap(page, "ttc");
    await openNotices(page, isMobile);
    await list(page).locator(".impact-card-map-btn:enabled").nth(3).waitFor();
    const filter = page.locator(".surface-notices-panel .submenu-search-input");
    await filter.fill("Filler");
    await expect(action(page, "two-stops")).toHaveCount(0);

    // A row well down the list, centred so the click itself does not scroll.
    const row = list(page).locator(".impact-card-map-btn:enabled").last();
    const id = await row.evaluate((el) => el.closest("[data-notice-map-action]")!.getAttribute("data-notice-map-action")!);
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const scrollTop = await list(page).evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(200);
    await action(page, id).click();
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /selected/, { timeout: 15_000 });

    if (isMobile) await strip(page).getByRole("button", { name: /Back to notices/ }).click();
    else await action(page, id).click();
    await expect(action(page, id)).toHaveText("View");
    await expect(filter).toHaveValue("Filler");
    await expect(action(page, "two-stops")).toHaveCount(0);
    await expect.poll(() => list(page).evaluate((el) => el.scrollTop)).toBe(scrollTop);
    await expect(action(page, id)).toBeFocused();
  });

  test("browser Back steps out of View to the list and leaves no entry behind", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [TWO_STOPS]);
    await openMap(page, "ttc");
    await openNotices(page, isMobile);
    const depth = () => page.evaluate(() => window.history.state?.linewatchNavigation?.depth);
    const listDepth = await depth();
    await expect(action(page, "two-stops")).toBeEnabled();
    await action(page, "two-stops").click();
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /selected-stops/, { timeout: 15_000 });
    expect(await depth()).toBe(listDepth + 1);

    await page.goBack();
    await expect(mapSurface(page)).not.toHaveAttribute("data-surface-selection-layers");
    await expect(list(page)).toBeVisible();
    await expect(action(page, "two-stops")).toHaveText("View");

    // View's one entry is spent, so none is left behind.
    expect(await depth()).toBe(listDepth);
  });

  test("one stop opens its departures, and Back returns to the list", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [ONE_STOP, ...FILLER]);
    await openMap(page, "ttc");
    await openNotices(page, isMobile);
    await action(page, "one-stop").click();

    const stop = page.locator("[data-surface-stop-panel='2034']");
    await expect(stop).toBeVisible();
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-stops/, { timeout: 15_000 });
    await expect(strip(page)).toHaveCount(0);

    await stop.locator("[data-notice-back]").click();
    await expect(stop).toHaveCount(0);
    await expect(list(page)).toBeVisible();
    await expect(action(page, "one-stop")).toHaveText("View");
    await expect(mapSurface(page)).not.toHaveAttribute("data-surface-selection-layers");
  });

  test("a route-wide notice selects the route, and an undrawn one is Not on Map", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [ROUTE_ONLY, NOT_DRAWN]);
    const geoMap = await openMap(page, "ttc");
    await openNotices(page, isMobile);

    const none = action(page, "not-drawn");
    await expect(none).toHaveText("Not on Map");
    await expect(none).toHaveAttribute("title", /^In TTC's current schedule, but none of its trips are drawn/);
    await expect(none).toBeDisabled();

    await action(page, "route-only").click();
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-line/, { timeout: 15_000 });
    await expect(geoMap).not.toHaveAttribute("data-buses", "on");
    // With Bus Routes off, the route keeps its badges.
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-badges/);
    if (isMobile) {
      await expect(strip(page)).toContainText("29");
      // Framed in the whole map above the strip: there is no sheet to leave room for.
      await expect.poll(async () => (await camera(page))?.zoom ?? 0, { timeout: 15_000 }).toBeGreaterThan(10.8);
    }
  });

  test("from a System Map, View switches to the Map View first and Back returns to it", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [ROUTE_ONLY]);
    await openMap(page, "ttc", "diagram");
    await openNotices(page, isMobile);
    await expect(page.locator(".geographic-network-map")).toHaveCount(0);

    await action(page, "route-only").click();
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /selected-line/, { timeout: 15_000 });
    // A map that mounts with a selection frames it, or the highlight is off screen.
    await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.events
      ?.some((event) => event.type === "focus" && event.detail?.startsWith("surface:")))).toBe(true);
    await page.goBack();
    await expect(page.locator(".geographic-network-map")).toHaveCount(0);
    await expect(list(page)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("linewatch-map-view-v1"))).toBe("diagram");
  });

  test("with notices naming only its route, a stop's warning and section are the route's", async ({ page }) => {
    await stubTtcNotices(page, [ROUTE_ONLY]);
    await page.addInitScript(() => localStorage.setItem("linewatch-default-network-v1", "ttc"));
    await page.goto("/?stop=2034");
    const stop = page.locator('[data-surface-stop-panel="2034"]');
    await expect(stop.locator('[data-station-section="station-impacts"]')).toContainText("Route Impacts");
    await expect(stop.locator("[data-station-disruption-warning]")).toContainText("Route Service May Be Disrupted");
  });

  test("a stop's Stop Impacts open the notice's card, and every way back returns to the stop", async ({ page, isMobile }) => {
    const other = { ...ONE_STOP, id: "same-stop", title: "29 Dufferin: Second notice at this stop", routeIds: ["29C"] };
    await stubTtcNotices(page, [ONE_STOP, other]);
    await openMap(page, "ttc");
    await openNotices(page, isMobile);
    await action(page, "one-stop").click();
    const stop = page.locator('[data-surface-stop-panel="2034"]');
    await expect(stop).toBeVisible();

    const impacts = stop.locator('[data-station-section="station-impacts"]');
    await expect(impacts).toContainText("Stop Impacts");
    await expect(stop.locator("[data-station-disruption-warning]")).toContainText("Schedule May Be Disrupted");
    await expect(impacts.locator(".station-impact-card")).toHaveCount(2);

    // The banner jumps to the cards, as a station's does.
    await stop.locator("[data-station-disruption-warning]").click();
    await expect(impacts).toBeInViewport();

    const openOther = () => impacts.locator('[data-stop-impact="same-stop"] button').click();
    await openOther();
    const cardBack = action(page, "same-stop");
    await expect(cardBack).toHaveAccessibleName(/^Back to Stop 2034/);
    await expect(cardBack).toBeInViewport();
    await cardBack.click();
    await expect(stop).toBeVisible();
    await expect(stop.locator("[data-notice-back]")).toContainText(ONE_STOP.title);

    await openOther();
    await expect(cardBack).toBeVisible();
    await page.goBack();
    await expect(stop).toBeVisible();

    // The notice whose View opened this stop goes back to its card in the list.
    await impacts.locator('[data-stop-impact="one-stop"] button').click();
    await expect(stop).toHaveCount(0);
    await expect(action(page, "one-stop")).toBeVisible();
  });

  test("a notice for several routes selects each one the map draws", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [SEVERAL_ROUTES]);
    await openMap(page, "ttc");
    await openNotices(page, isMobile);
    await action(page, "several-routes").click();
    const layers = mapSurface(page);
    await expect(layers).toHaveAttribute("data-surface-selection-layers", /transit-bus-selected-line/, { timeout: 15_000 });
    await expect(layers).toHaveAttribute("data-surface-selection-layers", /transit-streetcar-selected-outline/);
    await expect(layers).toHaveAttribute("data-surface-selection-layers", /transit-night-bus-selected-line/);
    if (isMobile) {
      await expect(strip(page).locator(".notice-route-badge")).toHaveCount(2);
      await expect(strip(page)).toContainText("+1");
    }
    await page.goBack();
    await expect(list(page)).toBeVisible();
  });

  test("GO/UP: a GO Bus notice selects its route and a rail notice has No Map Location", async ({ page, request, isMobile }) => {
    await setStubMode(request, "regional-live");
    const geoMap = await openMap(page, "regional");
    await openNotices(page, isMobile);

    await expect(action(page, "regional-notice-smoke")).toHaveText("No Map Location");
    await expect(action(page, "regional-notice-smoke")).toBeDisabled();

    await action(page, "regional-go-bus-notice-smoke").click();
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /selected-line/, { timeout: 15_000 });
    await expect(geoMap).not.toHaveAttribute("data-go-buses", "on");
    if (isMobile) {
      await expect(strip(page)).toContainText("31");
      await strip(page).getByRole("button", { name: /Back to notices/ }).click();
      await expect(list(page)).toBeVisible();
    } else {
      await action(page, "regional-go-bus-notice-smoke").click();
    }
    await expect(mapSurface(page)).not.toHaveAttribute("data-surface-selection-layers");
  });

  test("a notice result in search has View", async ({ page, isMobile }) => {
    await stubTtcNotices(page, [ROUTE_ONLY, NOT_DRAWN]);
    await openMap(page, "ttc");
    const input = isMobile ? page.getByRole("searchbox", { name: "Station Search" }) : page.getByPlaceholder(SEARCH_PLACEHOLDER, { exact: true });
    await input.click();
    await input.fill("Temporary route change");
    const row = page.locator('.global-search-notice-row[data-notice-map-action="route-only"]');
    await expect(row.locator(".impact-card-map-btn")).toBeEnabled({ timeout: 15_000 });
    await row.locator(".impact-card-map-btn").click();
    await expect(mapSurface(page)).toHaveAttribute("data-surface-selection-layers", /selected-line/, { timeout: 15_000 });

    if (isMobile) {
      await strip(page).getByRole("button", { name: /Back to notices/ }).click();
      await expect(input).toHaveValue("Temporary route change");
    } else {
      await expect(action(page, "route-only")).toHaveText("Back");
      await action(page, "route-only").click();
      await expect(input).toHaveValue("Temporary route change");
    }
    await expect(mapSurface(page)).not.toHaveAttribute("data-surface-selection-layers");
  });
});

test.describe("Layers sheet and phone Back", () => {
  test("Back closes the sheet, returns focus and stays on the map", async ({ page, request, isMobile }) => {
    test.skip(!isMobile, "Phones only");
    await setStubMode(request, "seeded");
    await installDismissedTransientUi(page);
    await openMap(page, "ttc");
    const button = page.locator(".mobile-layers-toggle");
    const sheet = page.locator("[data-map-layers-sheet]");

    await button.click();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(page.locator(".geographic-network-map")).toHaveAttribute("data-status", "ready");
    expect(await page.evaluate(() => window.history.state?.linewatchNavigation?.depth)).toBe(0);

    // A close from the sheet gives its entry back too.
    await button.click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.history.state?.linewatchNavigation?.depth)).toBe(0);
  });
});
