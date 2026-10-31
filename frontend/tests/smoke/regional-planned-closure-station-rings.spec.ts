import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

test.use({ serviceWorkers: "block" });

test("regional corridor planned closures do not add station rings", async ({ page, request }) => {
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
  await page.getByRole("group", { name: "Select transit network" })
    .getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  await page.locator('[data-dest="closures"]').click();

  const closure = page.locator('[data-impact-card-id="regional-demo-planned"]');
  await closure.getByRole("button", { name: "View Synthetic planned service change on map" }).click();
  await expect(page.locator('[data-system-map=regional] .overlay-segment-group[data-map-impact-id="regional-demo-planned"] > .asset-alert-path'))
    .toHaveAttribute("d", /^M /);
  expect(dashboardRequests).toBeGreaterThan(0);
  // Station-only planned closures are shared station alerts; a corridor
  // closure is drawn on its rail only.
  await expect(page.locator('[data-system-map=regional] .map-station-alert[data-map-impact-id="regional-demo-planned"]'))
    .toHaveCount(0);
  await page.locator('[data-impact-card-id="regional-station-only-planned"]')
    .getByRole("button", { name: "View Pickering station construction on map" }).click();
  const stationOnlyMarker = page.locator('[data-system-map=regional] .map-station-alert[data-map-impact-id="regional-station-only-planned"]');
  await expect(stationOnlyMarker).toHaveCount(1);
});
