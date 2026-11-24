import { expect, test, type Page } from "@playwright/test";
import {
  demoAvailability,
  demoCancellations,
  demoEpisodes,
  demoHotspots,
  demoPatterns,
  demoSeries,
  demoSummary,
} from "../../src/app/reliability-analytics-fixture";
import type {
  AnalyticsGranularity,
  AnalyticsNetworkId,
  AnalyticsSummary,
  DisruptionClassId,
} from "../../src/app/reliability-analytics";
import { defaultAnalyticsQuery, emptyAnalyticsDrilldown } from "../../src/app/reliability-range";
import { regionalGuideRoutes, stationsForGuideRoute, ttcGuideRoutes } from "../../src/app/transit-guide-data";

// Routed responses never reach the service worker's own fetches.
test.use({ serviceWorkers: "block" });

const TODAY = "2026-11-24";
// demoAvailability's history is the 140 days ending today.
const FIRST = "2026-07-08";
const NETWORKS = [
  { id: "ttc" as const, path: "/ttc/analytics", title: "TTC Subway & LRT", rows: 5, line: "line-2", lineLabel: "Line 2 Stations", stations: 31, other: "/go-up/analytics" },
  { id: "regional" as const, path: "/go-up/analytics", title: "GO Transit & UP Express", rows: 8, line: "regional-lw", lineLabel: "Lakeshore West Stations", stations: 16, other: "/ttc/analytics" },
];

type ApiState = {
  failing: 503 | 429 | "abort" | null;
  exportFailure?: 429 | "too-large" | null;
  change?: (summary: AnalyticsSummary) => AnalyticsSummary;
  requests: string[];
};

async function routeAnalytics(page: Page): Promise<ApiState> {
  const state: ApiState = { failing: null, exportFailure: null, requests: [] };
  await page.route("**/api/reliability/**", async (route) => {
    const url = new URL(route.request().url());
    state.requests.push(`${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/export")) {
      if (state.exportFailure === 429) {
        return route.fulfill({ status: 429, json: { error: "rate_limited", message: "Too many exports." } });
      }
      if (state.exportFailure === "too-large") {
        return route.fulfill({
          status: 400,
          json: { error: "export_too_large", message: "This export has 25000 rows; the limit is 20000. Choose a shorter range." },
        });
      }
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/csv;charset=UTF-8",
          "content-disposition": 'attachment; filename="linewatchto-reliability-test.csv"',
        },
        body: "service_date,network_id,line_id\r\n2026-11-24,ttc,line-1\r\n",
      });
    }
    if (state.failing === "abort") return route.abort("internetdisconnected");
    if (state.failing) return route.fulfill({ status: state.failing, json: { error: "unavailable", message: "No." } });
    const networkId = (url.searchParams.get("network") ?? "ttc") as AnalyticsNetworkId;
    const availability = demoAvailability(networkId, TODAY);
    if (url.pathname.endsWith("/availability")) return route.fulfill({ json: availability });
    const from = url.searchParams.get("from")!;
    const to = url.searchParams.get("to")!;
    const lines = (networkId === "ttc" ? ttcGuideRoutes : regionalGuideRoutes)
      .map((line) => ({ id: line.id, number: line.number, name: line.name, stations: stationsForGuideRoute(line) }));
    const query = { ...defaultAnalyticsQuery, line: url.searchParams.get("line"), station: url.searchParams.get("station") };
    const resolvedRange = { requestedFrom: from, requestedTo: to, from, to, clipped: false };

    if (url.pathname.endsWith("/series")) {
      const granularity = (url.searchParams.get("granularity") ?? "day") as AnalyticsGranularity;
      const byLine = url.searchParams.get("byLine") === "true";
      return route.fulfill({ json: demoSeries(networkId, lines, query, resolvedRange, availability, granularity, byLine) });
    }
    if (url.pathname.endsWith("/patterns")) {
      return route.fulfill({ json: demoPatterns(networkId, query, resolvedRange, availability) });
    }
    if (url.pathname.endsWith("/hotspots")) {
      const cls = (url.searchParams.get("class") || null) as DisruptionClassId | null;
      const sort = (url.searchParams.get("sort") === "incidents" ? "incidents" : "minutes");
      const limit = Number(url.searchParams.get("limit") ?? 12);
      return route.fulfill({ json: demoHotspots(networkId, lines, query, resolvedRange, availability, cls, sort, limit) });
    }
    if (url.pathname.endsWith("/episodes")) {
      const drilldown = {
        ...emptyAnalyticsDrilldown,
        disruptionClass: (url.searchParams.get("class") || null) as DisruptionClassId | null,
        kind: url.searchParams.get("kind") || null,
        cause: url.searchParams.get("cause") || null,
        planned: url.searchParams.get("planned") === null ? null : url.searchParams.get("planned") === "true",
        completed: url.searchParams.get("completed") === null ? null : url.searchParams.get("completed") === "true",
        minMinutes: url.searchParams.get("minMinutes") ? Number(url.searchParams.get("minMinutes")) : null,
        maxMinutes: url.searchParams.get("maxMinutes") ? Number(url.searchParams.get("maxMinutes")) : null,
        dayOfWeek: url.searchParams.get("dayOfWeek") ? Number(url.searchParams.get("dayOfWeek")) : null,
        hour: url.searchParams.get("hour") ? Number(url.searchParams.get("hour")) : null,
        sort: (url.searchParams.get("sort") === "longest" ? "longest" : "recent") as "recent" | "longest",
      };
      const limit = Number(url.searchParams.get("limit") ?? 25);
      const cursor = url.searchParams.get("cursor");
      return route.fulfill({ json: demoEpisodes(networkId, lines, query, resolvedRange, availability, drilldown, cursor, limit) });
    }
    if (url.pathname.endsWith("/cancellations")) {
      const granularity = (url.searchParams.get("granularity") ?? "day") as AnalyticsGranularity;
      return route.fulfill({ json: demoCancellations(networkId, lines, query, resolvedRange, availability, granularity) });
    }

    const summary = demoSummary(networkId, lines, query, resolvedRange, availability)!;
    return route.fulfill({ json: state.change ? state.change(summary) : summary });
  });
  return state;
}

const dashboard = (page: Page) => page.locator("[data-analytics-state]");
const ready = (page: Page) => expect(dashboard(page)).toHaveAttribute("data-analytics-state", "ready");
const bodyRows = (page: Page) => page.locator("tbody tr");

async function expectNoOverflow(page: Page, label: string) {
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0], label).toBeLessThanOrEqual(widths[1]);
}

for (const network of NETWORKS) {
  test(`${network.id}: filters live in the URL and the other network keeps the range`, async ({ page }) => {
    const api = await routeAnalytics(page);
    await page.goto(network.path);
    await ready(page);
    await expect(page.getByRole("heading", { level: 1, name: network.title })).toBeVisible();
    await expect(page.locator("[data-kpi]")).toHaveCount(5);
    await expect(bodyRows(page)).toHaveCount(network.rows);
    await expect(page.getByRole("button", { name: "30 Days" })).toHaveAttribute("aria-pressed", "true");
    expect(api.requests.at(-1)).toContain("from=2026-10-26&to=2026-11-24");
    await expect(page.getByText("Demo Data")).toHaveCount(0);
    // Only TTC publishes slow zones here.
    await expect(page.getByRole("columnheader", { name: "Slow Zones" })).toHaveCount(network.id === "ttc" ? 1 : 0);

    await page.getByRole("button", { name: "90 Days" }).click();
    await expect(page).toHaveURL(new RegExp(`${network.path}\\?range=90d$`));
    await ready(page);
    expect(api.requests.at(-1)).toContain("from=2026-08-27&to=2026-11-24");

    await page.getByRole("button", { name: "30 Days" }).click();
    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page).toHaveURL(/\?compare=1$/);
    await expect(page.getByText("Compared with Sep 26–Oct 25, 2026")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Change" })).toBeVisible();

    await page.getByRole("combobox", { name: network.id === "ttc" ? "Line" : "Corridor" }).selectOption(network.line);
    await expect(page.getByRole("heading", { level: 2, name: network.lineLabel })).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(network.stations);
    await page.getByRole("combobox", { name: "Station" }).selectOption({ index: 1 });
    await expect(bodyRows(page)).toHaveCount(1);

    const filtered = page.url();
    await page.reload();
    await ready(page);
    expect(page.url()).toBe(filtered);
    await expect(bodyRows(page)).toHaveCount(1);
    await page.goBack();
    await expect(bodyRows(page)).toHaveCount(network.stations);

    const other = page.getByRole("navigation", { name: "Analytics Network" }).locator(`a[href^="${network.other}"]`);
    await expect(other).toHaveAttribute("href", `${network.other}?compare=1`);
    await other.click();
    await ready(page);
    await expect(page).toHaveURL(new RegExp(`${network.other}\\?compare=1$`));
    await expect(page.getByRole("button", { name: "Compare" })).toHaveAttribute("aria-pressed", "true");
  });

  test(`${network.id}: fits phones, tablets and desktops in every theme`, async ({ page, isMobile }) => {
    test.skip(isMobile, "Sets its own widths");
    await routeAnalytics(page);
    for (const theme of ["dark", "light", "high-contrast"]) {
      await page.goto("/explore");
      await page.evaluate((value) => {
        localStorage.setItem("linewatch-theme-v1", value === "light" ? "light" : "dark");
        localStorage.setItem("linewatch-high-contrast-enabled-v1", String(value === "high-contrast"));
      }, theme);
      await page.goto(`${network.path}?range=12m&compare=1&line=${network.line}`);
      await ready(page);
      for (const width of [360, 639, 641, 767, 768, 959, 961, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoOverflow(page, `${theme} at ${width}px`);
      }
    }
  });
}

test("clips a range to the start of history and says so", async ({ page }) => {
  const api = await routeAnalytics(page);
  await page.goto("/ttc/analytics?range=12m");
  await ready(page);
  expect(api.requests.at(-1)).toContain(`from=${FIRST}&to=${TODAY}`);
  const coverage = page.getByRole("region", { name: "Range Coverage" });
  await expect(coverage).toContainText("History Starts Jul 8, 2026");
  await expect(coverage).toContainText("Before History 225");
  await expect(coverage).toContainText("Excluded 2");
  await expect(coverage.getByRole("img")).toHaveAttribute("aria-label", /^138 of 365 days counted/);
  await coverage.getByText("List Gaps").click();
  await expect(coverage).toContainText("Oct 28–29, 2026");
});

test("separates no history from no disruptions", async ({ page }) => {
  const api = await routeAnalytics(page);
  await page.goto("/ttc/analytics?range=custom&from=2026-06-01&to=2026-06-20");
  await expect(dashboard(page)).toHaveAttribute("data-analytics-state", "no-history");
  await expect(page.getByRole("heading", { name: "Not enough history for this range" })).toBeVisible();
  await expect(page.locator("[data-kpi]")).toHaveCount(0);
  expect(api.requests.filter((path) => path.includes("/summary"))).toEqual([]);

  api.change = (summary) => ({ ...summary, totals: { ...summary.totals, incidents: 0, weightedImpactPercentage: 0 } });
  await page.getByRole("button", { name: "Show All History" }).click();
  await expect(page).toHaveURL(/\?range=all$/);
  await expect(page.getByText("No disruptions observed in this range")).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(5);
});

test("dates commit only when real and in bounds", async ({ page }) => {
  await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);
  await page.getByLabel("From", { exact: true }).fill("2026-11-10");
  await expect(page).toHaveURL(/range=custom&from=2026-11-10&to=2026-11-24$/);
  await expect(page.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("To", { exact: true }).fill("2027-01-01");
  // Not blur() or Tab: Chromium's date control keeps focus through them, on phones and desktops in turn.
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(TODAY);
  await expect(page).toHaveURL(/to=2026-11-24$/);
});

test("sorts from the keyboard", async ({ page }) => {
  await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);
  const share = page.getByRole("columnheader", { name: "Share Affected" });
  await expect(share).toHaveAttribute("aria-sort", "descending");
  const name = page.getByRole("columnheader", { name: "Line" });
  await name.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(name).toHaveAttribute("aria-sort", "ascending");
  await expect(share).toHaveAttribute("aria-sort", "none");
  await expect(bodyRows(page).first()).toContainText("Yonge-University");
  await page.keyboard.press("Enter");
  await expect(bodyRows(page).first()).toContainText("Finch West");
  await page.getByRole("button", { name: "YTD" }).focus();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\?range=ytd$/);
});

test("offline keeps the loaded numbers, refuses other ranges, and recovers", async ({ page, context }) => {
  const api = await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);
  api.failing = "abort";
  await context.setOffline(true);
  await expect(page.getByText(/^Showing numbers loaded at .* Other ranges need a connection\.$/)).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(5);

  await page.getByRole("button", { name: "90 Days" }).click();
  await expect(dashboard(page)).toHaveAttribute("data-analytics-state", "error");
  await expect(page.getByText("You are offline. Analytics needs a connection.")).toBeVisible();
  // Never one range's numbers under another's dates, and no demo numbers in place of them.
  await expect(bodyRows(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View Demo Data" })).toHaveCount(0);

  api.failing = null;
  await context.setOffline(false);
  await ready(page);
  await expect(bodyRows(page)).toHaveCount(5);
  await expect(page.getByText("You are offline.")).toHaveCount(0);
});

test("an outage offers labelled demo data and never shows it unasked", async ({ page }) => {
  const api = await routeAnalytics(page);
  api.failing = 503;
  await page.goto("/go-up/analytics");
  await expect(dashboard(page)).toHaveAttribute("data-analytics-state", "error");
  await expect(page.locator("[data-kpi]")).toHaveCount(0);
  await page.getByRole("button", { name: "View Demo Data" }).click();
  await ready(page);
  await expect(page.getByText("Demo Data", { exact: true })).toHaveCount(2);
  await expect(page.getByText("They do not describe any service.")).toBeVisible();
  await expect(bodyRows(page)).toHaveCount(8);
  await page.getByRole("button", { name: "90 Days" }).click();
  await expect(page.getByText("Demo Data", { exact: true })).toHaveCount(2);

  api.failing = null;
  await page.getByRole("button", { name: "Try Live Data" }).click();
  await ready(page);
  await expect(page.getByText("Demo Data", { exact: true })).toHaveCount(0);
});

test("a rate limit is named and has no demo data", async ({ page }) => {
  const api = await routeAnalytics(page);
  api.failing = 429;
  await page.goto("/ttc/analytics");
  await expect(page.getByText("Too many ranges were requested.")).toBeVisible();
  await expect(page.getByRole("button", { name: "View Demo Data" })).toHaveCount(0);
});

test("the methodology pages open analytics, whose document is not cached for a day", async ({ page }) => {
  await routeAnalytics(page);
  for (const network of NETWORKS) {
    await page.goto(network.path.replace("analytics", "reliability"));
    await page.getByRole("link", { name: "Open Analytics" }).click();
    await expect(page).toHaveURL(new RegExp(`${network.path}$`));
    await ready(page);
    const response = await page.request.get(network.path);
    expect(response.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");
  }
});

for (const network of NETWORKS) {
  test(`${network.id}: chart mark drives the episode list, Show Table works, and network modules render`, async ({ page }) => {
    const api = await routeAnalytics(page);
    await page.goto(network.path);
    await ready(page);

    // Trend chart loads and exposes Show Table alternative.
    const trend = page.locator('[data-analytics-module="trend"]');
    await expect(trend.getByRole("img", { name: /Disruption trend by/ })).toBeVisible();
    await trend.getByRole("button", { name: /Show Table/ }).click();
    await expect(trend.getByRole("table")).toBeVisible();
    await trend.getByRole("button", { name: /Show Table/ }).click();
    await expect(trend.getByRole("img", { name: /Disruption trend by/ })).toBeVisible();

    // Clicking a Breakdown mark updates the URL and filters Counted Episodes.
    const breakdown = page.locator('[data-analytics-module="breakdown"]');
    const firstBar = breakdown.locator("ul li button").first();
    await expect(firstBar).toBeVisible();
    await firstBar.click();

    await expect(page).toHaveURL(/epKind=/);
    const episodes = page.locator('[data-analytics-module="episodes"]');
    await expect(episodes.getByRole("region", { name: "Active Episode Filters" })).toBeVisible();
    await expect(episodes.locator("[data-episode-id]").first()).toBeVisible();
    expect(api.requests.some((req) => req.includes("/api/reliability/episodes") && req.includes("kind="))).toBe(true);

    // Clearing filters removes epKind from URL.
    await episodes.getByRole("button", { name: "Clear Filters" }).click();
    await expect(page).not.toHaveURL(/epKind=/);

    // Network-specific module renders honestly.
    if (network.id === "ttc") {
      const slowZones = page.locator('[data-analytics-module="slow-zones"]');
      await slowZones.scrollIntoViewIfNeeded();
      await expect(slowZones.getByRole("heading", { name: "TTC Slow Zones" })).toBeVisible();
      await expect(page.locator('[data-analytics-module="cancellations"]')).toHaveCount(0);
    } else {
      const cancellations = page.locator('[data-analytics-module="cancellations"]');
      await cancellations.scrollIntoViewIfNeeded();
      await expect(cancellations.getByRole("heading", { name: "GO & UP Train Cancellations" })).toBeVisible();
      await expect(page.locator('[data-analytics-module="slow-zones"]')).toHaveCount(0);
    }
  });
}

test("CSV export handles 429 rate limits and the 20,000-row cap visibly", async ({ page }) => {
  const api = await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);

  const exportLink = page.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toHaveAttribute("href", /\/api\/reliability\/export\?network=ttc/);

  const alertBox = dashboard(page).getByRole("alert");
  api.exportFailure = 429;
  await exportLink.click();
  await expect(alertBox).toContainText("10 exports per 10 minutes");

  api.exportFailure = "too-large";
  await exportLink.click();
  await expect(alertBox).toContainText("20000");
});
