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

  const overlay = page.locator(
    '.regional-overlay-segment-group[data-regional-impact-kind="delay"][data-regional-impact-id="regional-demo-delay"]',
  );
  await expect(overlay).toHaveCount(1);
  await overlay.locator(".regional-impact-hit-target").dispatchEvent("click");
  await expect(overlay).toHaveAttribute("data-regional-impact-selected", "true");
  const glow = overlay.locator(".regional-impact-interactive-glow");
  await expect(glow).toHaveClass(/map-selection-attention/, { timeout: 5_000 });
  await expect(glow).toHaveCSS("animation-name", /regional-selection-path-(intro|breathe)/);

  const refreshed = page.waitForResponse((response) => response.url().includes("/api/dashboard?network=regional"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await refreshed;
  await expect(glow).toHaveClass(/map-selection-attention/);
  await expect(glow).toHaveCSS("animation-name", /regional-selection-path-(intro|breathe)/);
});
