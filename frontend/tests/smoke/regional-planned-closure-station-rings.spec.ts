import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.use({ serviceWorkers: "block" });

test("regional corridor planned closures do not add station rings", async ({ page, request, isMobile }) => {
  await setStubMode(request, "regional-live");
  await installDismissedTransientUi(page);
  let dashboardRequests = 0;
  await page.route("**/api/dashboard?network=regional", async (route) => {
    dashboardRequests += 1;
    const response = await route.fetch();
    const data = await response.json();
    data.plannedClosures = data.plannedClosures.map((closure: { id: string }) =>
      closure.id === "regional-demo-planned"
        ? { ...closure, previewStationIds: ["pickering", "ajax", "whitby"] }
        : closure,
    );
    await route.fulfill({ response, json: data });
  });
  await page.goto("/");
  const switcher = isMobile
    ? page.locator(".mobile-map-network-switch")
    : page.getByRole("group", { name: "Select transit network" });
  await switcher.getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  if (isMobile) {
    await page.getByRole("button", { name: "Status", exact: true }).click();
    await page.locator(".mobile-status-sheet .mobile-status-btn-closures").click();
  } else {
    await page.locator('[data-dest="closures"]').click();
  }

  const closure = page.locator('[data-impact-card-id="regional-demo-planned"]');
  await closure.getByRole("button", { name: "View Synthetic planned service change on map" }).click();
  await expect(page.locator('[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"] > .asset-alert-path'))
    .toHaveAttribute("d", /^M /);
  expect(dashboardRequests).toBeGreaterThan(0);
  // Station-only planned closures are shared station alerts; a corridor
  // closure is drawn on its rail only.
  await expect(page.locator('[data-system-map=regional] .map-station-alert[data-map-impact-id="regional-demo-planned"]'))
    .toHaveCount(0);
  // On mobile, viewing on the map opens the impact inspector over the map.
  if (isMobile) {
    await page.getByRole("complementary", { name: "Selected map impact details" })
      .getByRole("button", { name: "View in List", exact: true }).click();
  }
  await page.locator('[data-impact-card-id="regional-station-only-planned"]')
    .getByRole("button", { name: "View Pickering station construction on map" }).click();
  const stationOnlyMarker = page.locator('[data-system-map=regional] .map-station-alert[data-map-impact-id="regional-station-only-planned"]');
  await expect(stationOnlyMarker).toHaveCount(1);
});
