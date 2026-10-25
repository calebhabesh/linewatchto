import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("TTC station disruption warning includes a planned closure from preview geometry", async ({ page, request }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.route("**/api/dashboard?network=ttc", async (route) => {
    const response = await route.fetch();
    const dashboard = await response.json();
    dashboard.map.segments = dashboard.map.segments.map((segment: { id: string }) =>
      segment.id === "stub-line-1-segment"
        ? { ...segment, stationAId: "stub-station", stationBId: "stub-eglinton" }
        : segment,
    );
    await route.fulfill({ response, json: dashboard });
  });
  await page.route("**/api/stations/stub-station", async (route) => {
    const response = await route.fetch();
    const station = await response.json();
    station.impacts = station.impacts.filter((impact: { id: string }) => impact.id !== "stub-closure-line-1");
    await route.fulfill({ response, json: station });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Stub Station station details", exact: true }).dispatchEvent("click");
  const panel = page.locator(".station-detail-panel");
  await expect(panel).toBeVisible();
  const summary = panel.locator("[data-station-disruption-warning]");
  await expect(summary).toContainText("Schedule May Be Disrupted");
  await expect(summary).toHaveAttribute("aria-label", /Active Closure/);
  await expect(summary.locator(".station-disruption-badge").first()).toBeVisible();
});

test("regional station disruption warning jumps to and outlines every station impact", async ({ page, request, isMobile }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const networkSwitcher = isMobile
    ? page.locator(".mobile-map-network-switch")
    : page.getByLabel("Map network switcher");
  await networkSwitcher.getByRole("button", { name: "GO/UP", exact: true }).click();
  const station = page.getByRole("button", { name: "Pickering station details", exact: true });
  await expect(station).toBeAttached();
  await station.dispatchEvent("click");

  const panel = page.locator(".regional-station-detail");
  await expect(panel).toBeVisible();
  const closureAction = panel.locator("[data-station-disruption-warning]");
  await expect(closureAction).toContainText("Schedule May Be Disrupted");
  await expect(closureAction).toHaveAttribute("aria-label", /Planned Advisory \(2\)/);
  const impactCards = panel.locator('[data-station-section="station-impacts"] .station-impact-card');
  const closureCard = panel.locator("#station-impact-planned-closure-regional-station-only-planned");
  await expect(closureAction).toBeVisible();
  await closureAction.click();
  await expect(panel).toBeVisible();
  await expect(closureCard).toBeAttached();
  await expect(panel.locator('[data-station-section="station-impacts"]')).toBeInViewport();
  const cardCount = await impactCards.count();
  expect(cardCount).toBeGreaterThan(1);
  await expect(panel.locator(".station-impact-card-highlight-soft")).toHaveCount(cardCount);
  await expect(panel.locator(".station-impact-card-highlight")).toHaveCount(0);
  await expect.poll(() => panel.locator(".station-detail-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
