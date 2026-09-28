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
  await expect(panel.getByText("Schedule May Be Disrupted:", { exact: true })).toBeVisible();
  await expect(panel.locator("[data-station-disruption-warning] .station-impact-jump-button")).toHaveCount(3);
  await expect(panel.getByRole("link", { name: /Jump to station impact: Active Closure/ })).toBeVisible();
});

test("regional station disruption warning jumps to the matching planned closure card", async ({ page, request, isMobile }) => {
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
  await expect(panel.getByText("Schedule May Be Disrupted:", { exact: true })).toBeVisible();
  await expect(panel.locator("[data-station-disruption-warning] .station-impact-jump-button")).toHaveCount(3);
  const closureAction = panel.getByRole("button", { name: /Jump to station impact: Planned Closure - Pickering station construction/ });
  const closureCard = panel.locator("#station-impact-planned-closure-regional-station-only-planned");
  await expect(closureAction).toBeVisible();
  await closureAction.click();
  await expect(panel).toBeVisible();
  await expect(closureCard).toBeInViewport();
  await expect(closureCard).toHaveClass(/station-impact-card-highlight/);
  await expect.poll(() => panel.locator(".station-detail-scroll").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});
