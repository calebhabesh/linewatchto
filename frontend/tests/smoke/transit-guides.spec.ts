import { expect, test } from "@playwright/test";

const guideTemplates = [
  { path: "/explore", heading: "Explore Toronto Rapid Transit" },
  { path: "/ttc", heading: "TTC Subway, LRT Lines, and Stations" },
  { path: "/go-up", heading: "GO Transit and UP Express Lines and Stations" },
  { path: "/ttc/lines/1-yonge-university", heading: "Line 1 Yonge-University" },
  { path: "/go-up/corridors/lakeshore-west", heading: "LW Lakeshore West" },
  { path: "/ttc/stations/union", heading: "Union" },
  { path: "/go-up/stations/oakville", heading: "Oakville" },
  { path: "/ttc/reliability", heading: "How LineWatchTO Measures TTC Reliability" },
  { path: "/go-up/reliability", heading: "How LineWatchTO Measures GO & UP Reliability" },
];

test("serves crawlable transit guides with indexable metadata and cache headers", async ({ page }) => {
  const response = await page.goto("/explore");

  expect(response?.ok()).toBe(true);
  expect(response?.headers()["cache-control"]).toContain("s-maxage=86400");
  await expect(page).toHaveTitle(/Toronto Transit Lines.*LineWatchTO/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://linewatchto.ca/explore");
  await expect(page.getByRole("heading", { level: 1, name: "Explore Toronto Rapid Transit" })).toBeVisible();
  await expect(page.locator('a[href="/ttc/lines/1-yonge-university"]')).toBeVisible();
  await expect(page.locator('a[href^="/go-up/corridors/"]').first()).toBeVisible();
});

test("keeps every guide template overflow-free in both app themes", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 360, height: 800 } : { width: 1440, height: 900 });

  for (const theme of ["dark", "light"] as const) {
    await page.goto("/explore");
    await page.evaluate((value) => window.localStorage.setItem("linewatch-theme-v1", value), theme);
    await page.reload();

    for (const template of guideTemplates) {
      await page.goto(template.path);
      await expect(page.getByRole("heading", { level: 1, name: template.heading })).toBeVisible();
      await expect(page.locator("[data-guide-shell]")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/);
      const widths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll, `${template.path} overflowed at ${theme} ${isMobile ? "360px" : "1440px"}`).toBeLessThanOrEqual(widths.client);
    }
  }
});

test("keeps the changed guide breakpoints overflow-free", async ({ page, isMobile }) => {
  test.skip(isMobile, "Breakpoint coverage only needs one Chromium project");

  for (const width of [639, 641, 899, 901]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/ttc", "/go-up/corridors/lakeshore-west"]) {
      await page.goto(path);
      const widths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll, `${path} overflowed at ${width}px`).toBeLessThanOrEqual(widths.client);
    }
  }
});

test("filters the crawlable station directory and keeps section navigation keyboard-usable", async ({ page }) => {
  await page.goto("/ttc");

  const directory = page.locator("#station-directory-list");
  await expect(directory.locator('a[href^="/ttc/stations/"]')).toHaveCount(109);
  const filter = page.getByRole("searchbox", { name: "Filter stations" });
  await filter.focus();
  await expect(filter).toBeFocused();
  await filter.fill("Finch");
  await expect(directory.locator('a[href="/ttc/stations/finch"]')).toBeVisible();
  await expect(directory.getByRole("link", { name: /^Union/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear station filter" }).press("Enter");
  await expect(directory.locator('a[href^="/ttc/stations/"]')).toHaveCount(109);

  const onThisPage = page.getByRole("navigation", { name: "On this page" });
  await onThisPage.getByRole("link", { name: "Stations" }).press("Enter");
  await expect(page).toHaveURL(/#station-directory$/);
});

test("uses active, network-aware guide navigation", async ({ page }) => {
  await page.goto("/go-up/corridors/lakeshore-west");
  const nav = page.getByRole("navigation", { name: "Transit guides" });
  await expect(nav.getByRole("link", { name: "GO & UP" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Reliability" })).toHaveAttribute("href", "/go-up/reliability");

  await page.goto("/ttc/reliability");
  await expect(nav.getByRole("link", { name: "Reliability" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Reliability" })).toHaveAttribute("href", "/ttc/reliability");
});

test("opens TTC and regional station details from guide destinations", async ({ page }) => {
  for (const destination of [
    { guide: "/ttc/stations/union", href: "/?network=ttc&station=union", network: "ttc", detail: ".station-detail-panel" },
    { guide: "/go-up/stations/oakville", href: "/?network=regional&station=oakville", network: "regional", detail: ".regional-station-detail" },
  ]) {
    await page.goto(destination.guide);
    const link = page.getByRole("link", { name: "Open station on map" });
    await expect(link).toHaveAttribute("href", destination.href);
    await link.click();
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", destination.network);
    await expect(page.locator(destination.detail)).toBeVisible();
  }
});

test("opens TTC and regional line impacts from guide destinations", async ({ page }) => {
  for (const destination of [
    { guide: "/ttc/lines/1-yonge-university", href: "/?network=ttc&line=line-1", network: "ttc", heading: /Yonge-University/i },
    { guide: "/go-up/corridors/lakeshore-west", href: "/?network=regional&line=regional-lw", network: "regional", heading: /Lakeshore West/i },
  ]) {
    await page.goto(destination.guide);
    const link = page.getByRole("link", { name: "View current status" });
    await expect(link).toHaveAttribute("href", destination.href);
    await link.click();
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", destination.network);
    await expect(page.locator("[data-line-impacts]")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: destination.heading })).toBeVisible();
  }
});

test("opens network-scoped reliability from both methodology guides", async ({ page }) => {
  for (const destination of [
    { guide: "/ttc/reliability", href: "/?network=ttc&panel=analytics", network: "ttc" },
    { guide: "/go-up/reliability", href: "/?network=regional&panel=analytics", network: "regional" },
  ]) {
    await page.goto(destination.guide);
    const link = page.getByRole("link", { name: "View reliability" });
    await expect(link).toHaveAttribute("href", destination.href);
    await link.click();
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", destination.network);
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-active-view", "analytics");
    await expect(page.getByRole("region", { name: "Reliability Analytics" })).toBeVisible();
  }
});

test("station guides return to the network directory", async ({ page }) => {
  await page.goto("/ttc/stations/union");
  await expect(page.getByRole("link", { name: "Browse all stations" })).toHaveAttribute("href", "/ttc#station-directory");
});
