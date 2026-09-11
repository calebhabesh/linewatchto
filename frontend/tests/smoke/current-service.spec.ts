import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, "Current Service tests cover desktop layout; mobile is tested in mobile-service-sheet.spec.ts");
  await installDismissedTransientUi(page);
});

test("Current Service appears above the retained badges and opens its exact disruption", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Current Service", exact: true })).toBeVisible();
  await expect(panel).not.toContainText("Updated");
  await expect(panel).not.toContainText("Reduced speed zone");
  await expect(panel.getByRole("button", { name: /Collapse|Expand/ })).toHaveCount(0);
  const badges = page.locator(isMobile ? ".mobile-status-peek-counts" : ".desktop-status-chip-row");
  await expect(badges).toBeVisible();
  const panelBox = await panel.boundingBox();
  const badgeBox = await badges.boundingBox();
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(badgeBox!.y);
  await panel.getByRole("button", { name: /Sheppard-Yonge to Don Mills/ }).click();
  await expect(page.getByRole("heading", { name: "Delays", exact: true })).toBeVisible();
  await expect(page.locator('[data-impact-card-id="stub-delay-line-4"]')).toHaveClass(/highlight-active-card/);
});

test("unavailable data cannot read as clear service", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Current status unavailable");
  await expect(panel).not.toContainText("No active alerts/delays");
  await expect(panel.locator(".current-service-impact")).toHaveCount(0);
});

test("regional readout has corridor identities and separate service notices", async ({ page, request }) => {
  await setStubMode(request, "regional-live");
  await page.goto("/");
  await page.getByRole("button", { name: "GO/UP", exact: true }).click();
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toContainText(/GO & UP rail/i);
  await expect(panel).toContainText(/Service Notices/i);
  await expect(panel).not.toContainText(/Streetcar \/ Bus Alerts/i);
});

test("readout does not change the map viewport or camera", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Current Service", exact: true });
  await expect(panel).toBeVisible();
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.getByRole("button", { name: "Center map view" }).first().click();
  const viewport = page.locator("[data-map-pan-zoom-viewport]");
  const before = await viewport.boundingBox();
  const camera = await page.locator(".ttc-map-stage").evaluate((node) => node.style.transform);
  await panel.evaluate((node) => { node.style.display = "none"; });
  await page.waitForTimeout(200);
  expect(await viewport.boundingBox()).toEqual(before);
  expect(await page.locator(".ttc-map-stage").evaluate((node) => node.style.transform)).toBe(camera);
});
