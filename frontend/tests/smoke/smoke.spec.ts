import { expect, test } from "@playwright/test";
import {
  installDismissedTransientUi,
  setStubMode,
} from "./test-support";

test.beforeEach(async ({ page }) => {
  await installDismissedTransientUi(page);
});

test("loads TTC status and connects a map impact to its rider-facing detail", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).press("Enter");

  if (isMobile) {
    const inspector = page.locator("[data-mobile-impact-inspector]");
    await expect(inspector).toContainText("Delay");
    await inspector.getByRole("button", { name: "View in List" }).click();
  }

  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toHaveClass(/highlight-active-card/);
});

test("searches across networks and opens a regional station", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();

  if (isMobile) {
    await page.getByRole("searchbox", { name: "Station Search" }).click();
  }

  const search = page.getByRole("searchbox", { name: "Station Search" });
  await search.click();
  await search.fill("Oakville");
  await page.getByRole("button", { name: "Oakville GO and UP station search result" }).click();

  await expect(page.getByRole("region", { name: "Interactive GO and UP map" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Oakville regional station details" })).toBeVisible();
  if (isMobile) {
    await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
  } else {
    await expect(page.getByRole("button", { name: "GO/UP", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
});

test("falls back without presenting fixture data as live", async ({ page, request, isMobile }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" }).first()).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  } else {
    await expect(page.locator(".mobile-service-sheet-recessed-badge").filter({ hasText: /Unknown/i }).first()).toBeVisible();
  }

  await expect(page.getByText("Live status", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-map-impact-id]")).toHaveCount(0);
});
