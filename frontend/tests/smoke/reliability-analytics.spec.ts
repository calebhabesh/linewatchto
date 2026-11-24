import { expect, test, type Page } from "@playwright/test";
import {
  demoAvailability,
  demoCancellations,
  demoEpisodes,
  demoHotspots,
  demoOnTime,
  demoPatterns,
  demoSeries,
  demoSummary,
  demoTtcDelayLog,
  demoTtcPerformanceHistory,
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
    if (url.pathname.endsWith("/on-time")) {
      const granularity = (url.searchParams.get("granularity") ?? "day") as AnalyticsGranularity;
      return route.fulfill({ json: demoOnTime(lines, query, resolvedRange, granularity) });
    }
    if (url.pathname.endsWith("/ttc-delay-log")) {
      const granularity = (url.searchParams.get("granularity") ?? "day") as AnalyticsGranularity;
      return route.fulfill({ json: demoTtcDelayLog(resolvedRange, granularity) });
    }
    if (url.pathname.endsWith("/ttc-performance")) {
      return route.fulfill({ json: demoTtcPerformanceHistory(resolvedRange) });
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

    await page.getByRole("combobox", { name: network.id === "ttc" ? "Line" : "Corridor" }).click();
    await expect(page.getByRole("option")).toHaveCount(network.rows + 1);
    await page.getByRole("option", { name: network.id === "ttc" ? "Line 2 Bloor-Danforth" : "Lakeshore West" }).click();
    await expect(page.getByRole("heading", { level: 2, name: network.lineLabel })).toBeVisible();
    await expect(bodyRows(page)).toHaveCount(network.stations);
    await page.getByRole("combobox", { name: "Station" }).click();
    await page.getByRole("option").nth(1).click();
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

test("the date pickers choose only days with history, by pointer and keyboard", async ({ page }) => {
  await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);
  const from = page.getByRole("button", { name: /^From / });
  const to = page.getByRole("button", { name: /^To / });
  await from.click();
  const picker = page.getByRole("dialog", { name: "Choose From Date" });
  await expect(picker.getByText("October 2026")).toBeVisible();
  await picker.getByRole("button", { name: "Next Month" }).click();
  await picker.getByRole("button", { name: /November 10, 2026/ }).click();
  await expect(picker).toHaveCount(0);
  await expect(page).toHaveURL(/range=custom&from=2026-11-10&to=2026-11-24$/);
  await expect(page.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await expect(from).toBeFocused();

  // Nothing after today, or before history.
  await to.click();
  const toPicker = page.getByRole("dialog", { name: "Choose To Date" });
  await expect(toPicker.getByRole("button", { name: /November 25, 2026/ })).toBeDisabled();
  await expect(toPicker.getByRole("button", { name: "Next Month" })).toBeDisabled();
  await expect(toPicker.getByRole("button", { name: /November 24, 2026/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await expect(toPicker.getByRole("button", { name: /November 17, 2026/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/from=2026-11-10&to=2026-11-17$/);

  await from.focus();
  await page.keyboard.press("Enter");
  for (let month = 0; month < 6; month += 1) await page.keyboard.press("PageUp");
  await expect(picker.getByRole("button", { name: /July 8, 2026/ })).toBeFocused();
  await expect(picker.getByRole("button", { name: /July 7, 2026/ })).toBeDisabled();
  await expect(picker.getByRole("button", { name: "Previous Month" })).toBeDisabled();
  await page.keyboard.press("Tab");
  await expect(picker.getByRole("button", { name: "Next Month" })).toBeFocused();
  await expectNoOverflow(page, "date picker open");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(from).toBeFocused();
  await expect(page).toHaveURL(/from=2026-11-10&to=2026-11-17$/);
});

test("the line and station menus work from the keyboard", async ({ page }) => {
  await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);
  const line = page.getByRole("combobox", { name: "Line" });
  const station = page.getByRole("combobox", { name: "Station" });
  await expect(station).toBeDisabled();
  await line.focus();
  await line.press("ArrowDown");
  await expect(line).toHaveAttribute("aria-expanded", "true");
  // Names fit on one line, and the menu stays on screen, at any field width.
  for (const option of await page.getByRole("option").all()) expect((await option.boundingBox())!.height).toBeLessThan(45);
  await expectNoOverflow(page, "line menu open");
  await line.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(line).toBeFocused();
  await line.press("Enter");
  await line.press("ArrowDown");
  await line.press("Enter");
  await expect(line).toHaveText("Line 1 Yonge-University");
  await expect(page).toHaveURL(/line=line-1$/);

  await station.focus();
  await station.press("Enter");
  await station.press("End");
  // The marked option stays in view, and typing jumps to a name.
  await expect(page.getByRole("option").last()).toBeInViewport();
  await page.keyboard.type("uni");
  await page.keyboard.press("Enter");
  await expect(station).toHaveText("Union");
  await station.press("Enter");
  await station.press("Tab");
  await expect(page.getByRole("listbox")).toHaveCount(0);
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

for (const network of NETWORKS) {
  test(`${network.id}: the dashboard panel has ranges, charts and links into the same range`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-welcome-seen-v1", "true");
      localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
      localStorage.setItem("linewatch-seen-release-notes-version", "1.4.0");
    });
    const api = await routeAnalytics(page);
    await page.goto(`/?network=${network.id}&panel=analytics`);
    const panel = page.locator(".analytics-panel");
    await expect(panel.getByText("Data Collection Is Just Beginning.")).toBeVisible();
    await expect(panel.locator(".reliability-trend-bar")).toHaveCount(30);
    await panel.locator(".reliability-trend").press("ArrowRight");
    await expect(panel.locator(".reliability-insight > .reliability-chart-readout")).toContainText(/incidents|coverage gap/);

    // 140 recorded days fill 90 days but not 12 months.
    await expect(panel.getByRole("button", { name: "Last 90 days", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: /^Last 12 months \(140 of \d+ days recorded so far\)$/ }).click();
    await expect(panel.locator(".reliability-intro")).toContainText("Jul 8–Nov 24, 2026");
    expect(api.requests.some((path) => path.includes("/summary") && path.includes(`from=${FIRST}`))).toBe(true);
    await expect(panel.getByRole("link", { name: "Full Analytics Page" })).toHaveAttribute("href", `${network.path}?range=12m`);
    await expect(panel.locator("a.reliability-card-heading")).toHaveCount(network.rows);
    await expect(panel.locator(`a.reliability-card-heading[href="${network.path}?range=12m&line=${network.line}"]`)).toBeVisible();

    await panel.getByRole("button", { name: "When", exact: true }).click();
    await expect(panel.locator(".reliability-heat-cell")).toHaveCount(168);
    await panel.getByRole("button", { name: "Where", exact: true }).click();
    await expect(panel.locator(".reliability-hotspots li")).toHaveCount(5);
    await panel.getByRole("button", { name: "Type", exact: true }).click();
    await expect(panel.getByText("Share of Incident-Hours")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // The sidebar's height-limited list must scroll its cards, not squash the last ones.
    const squashed = await panel.locator(".reliability-card").evaluateAll((cards) =>
      cards.filter((card) => card.clientHeight < 40 || card.scrollHeight > card.clientHeight + 1).length);
    expect(squashed).toBe(0);
  });
}

/** Neighbouring text on one line whose baselines differ, as "label / number: px". */
async function unevenBaselines(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((rows) => {
    const canvas = document.createElement("canvas").getContext("2d")!;
    const uneven: string[] = [];
    for (const row of document.querySelectorAll(rows)) {
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let previous: { text: string; top: number; bottom: number; baseline: number } | null = null;
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.data.trim() || node.parentElement!.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        const style = getComputedStyle(node.parentElement!);
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = canvas.measureText("x");
        const item = { text: node.data.trim(), top: rect.top, bottom: rect.bottom, baseline: rect.top + rect.height * ascent / (ascent + descent) };
        const difference = previous ? item.baseline - previous.baseline : 0;
        if (previous && Math.min(item.bottom, previous.bottom) - Math.max(item.top, previous.top) > 6
          && Math.abs(difference) > 0.5 && Math.abs(difference) < 6) {
          uneven.push(`${previous.text} / ${item.text}: ${difference.toFixed(1)}`);
        }
        previous = item;
      }
    }
    return [...new Set(uneven)];
  }, selector);
}

for (const network of NETWORKS) {
  test(`${network.id}: figures sit on the same baseline as their labels`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-welcome-seen-v1", "true");
      localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
      localStorage.setItem("linewatch-seen-release-notes-version", "1.4.0");
    });
    await routeAnalytics(page);
    await page.goto(`/?network=${network.id}&panel=analytics`);
    await expect(page.locator(".reliability-trend-bar")).toHaveCount(30);
    await page.evaluate(() => document.fonts.ready);
    const panelRows = ".reliability-classes li, .reliability-card-heading, .reliability-caption, .reliability-official-row, .reliability-cancellations tr, .reliability-hotspots li, .reliability-kinds li, .reliability-intro p";
    for (const view of ["Trend", "Where", "Type"]) {
      await page.locator(".reliability-insights").getByRole("button", { name: view, exact: true }).click();
      expect(await unevenBaselines(page, panelRows), view).toEqual([]);
    }

    await page.goto(network.path);
    await ready(page);
    await page.locator('[data-analytics-module="where"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-analytics-module="where"] [class*="rankedRow"]').first()).toBeVisible();
    expect(await unevenBaselines(page, '[class*="rankedTop"], [class*="metricTiles"] li, [class*="durationStats"] dl > div, [class*="coverageLegend"] li')).toEqual([]);
  });
}

test("marking a chart item never moves the page", async ({ page }) => {
  await routeAnalytics(page);
  await page.goto("/ttc/analytics");
  await ready(page);
  for (const [id, mark] of [["trend", '[class*="chartMark"]'], ["where", '[class*="rankedRow"]'], ["calendar", '[class*="chartMark"]']]) {
    const card = page.locator(`[data-analytics-module="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    const item = card.locator(mark).nth(2);
    await item.waitFor();
    const before = (await card.boundingBox())!.height;
    await item.focus();
    expect((await card.boundingBox())!.height, id).toBe(before);
  }
});

test("the dashboard panel never shows the 30-day figures under a range that failed", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("linewatch-welcome-seen-v1", "true");
    localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    localStorage.setItem("linewatch-seen-release-notes-version", "1.4.0");
  });
  const api = await routeAnalytics(page);
  api.failing = 503;
  await page.goto("/?network=ttc&panel=analytics");
  const panel = page.locator(".analytics-panel");
  await expect(panel.getByText("Reliability data is unavailable right now.")).toBeVisible();
  await panel.getByRole("button", { name: "Last 90 days" }).click();
  await expect(panel.locator("a.reliability-card-heading")).toHaveCount(0);
  await expect(panel.getByText("Dates Unavailable")).toBeVisible();

  api.failing = null;
  await panel.getByRole("button", { name: "Try Again" }).click();
  await expect(panel.locator("a.reliability-card-heading")).toHaveCount(5);
});
