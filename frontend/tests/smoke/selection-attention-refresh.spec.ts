import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.beforeEach(async ({ page }) => {
  await installDismissedTransientUi(page);
});

test("TTC diagram selection keeps breathing after a dashboard refresh", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "Animated diagram attention is verified on desktop");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");

  const highlight = page.locator('[data-selected-impact-emphasis="stub-delay-line-4"]');
  await expect(highlight).toHaveClass(/selection-intro-complete/, { timeout: 5_000 });
  await expect(highlight).toHaveCSS("animation-name", "map-selection-path-breathe");

  const refreshed = page.waitForResponse((response) => response.url().includes("/api/dashboard?network=ttc"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  await expect(highlight).toHaveClass(/selection-intro-complete/);
  await expect(highlight).toHaveCSS("animation-name", "map-selection-path-breathe");
});

test("GO/UP diagram selection keeps breathing after a dashboard refresh", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "Animated diagram attention is verified on desktop");
  await setStubMode(request, "regional-live");
  await page.goto("/");
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");

  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");

  const target = page.locator(
    '.regional-map .map-segment-hit-target[data-map-impact-kind="delay"][data-map-impact-id="regional-demo-delay"]',
  );
  await expect(target).toHaveCount(1);
  await target.dispatchEvent("click");
  const glow = page.locator('#regional-dynamic-selected-segment-layer [data-selected-impact-emphasis="regional-demo-delay"]').first();
  await expect(glow).toHaveClass(/map-selection-attention/, { timeout: 5_000 });
  await expect(glow).toHaveCSS("animation-name", /map-selection-path-(intro|breathe)/);
  const glowNode = await glow.elementHandle();

  const refreshed = page.waitForResponse((response) => response.url().includes("/api/dashboard?network=regional"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  await expect(glow).toHaveClass(/map-selection-attention/);
  await expect(glow).toHaveCSS("animation-name", /map-selection-path-(intro|breathe)/);
  // The emphasis keeps its node across the refresh, so its breathing never restarts.
  expect(await glowNode!.evaluate((node) => node.isConnected)).toBe(true);
});
