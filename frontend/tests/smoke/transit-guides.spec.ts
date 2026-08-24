import { expect, test } from "@playwright/test";

test("serves crawlable transit guides with indexable metadata and cache headers", async ({ page }) => {
  const response = await page.goto("/explore");

  expect(response?.ok()).toBe(true);
  expect(response?.headers()["cache-control"]).toContain("s-maxage=86400");
  await expect(page).toHaveTitle(/Toronto Transit Lines.*LineWatchTO/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://linewatchto.ca/explore",
  );
  await expect(page.getByRole("heading", { level: 1, name: "Explore Toronto Rapid Transit" })).toBeVisible();
  await expect(page.locator('a[href="/ttc/lines/1-yonge-university"]')).toBeVisible();
  await expect(page.locator('a[href^="/go-up/corridors/"]').first()).toBeVisible();
});

test("keeps a station guide usable and overflow-free on desktop and mobile", async ({ page }) => {
  await page.goto("/ttc/stations/union");

  await expect(page).toHaveTitle(/Union TTC Station.*LineWatchTO/);
  await expect(page.getByRole("heading", { level: 1, name: "Union" })).toBeVisible();
  await expect(page.locator('a[href="/?network=ttc&station=union"]')).toBeVisible();

  const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(structuredData.some((value) => JSON.stringify(JSON.parse(value)).includes('"TrainStation"'))).toBe(true);

  const pageWidths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(pageWidths.scroll).toBeLessThanOrEqual(pageWidths.client);
});
