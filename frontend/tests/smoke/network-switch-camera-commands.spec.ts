import { expect, test, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode, waitForNetworkTransition } from "./test-support";

// Both diagram maps stay mounted after a visit, so zoom and Center commands
// must reach only the map the rider is looking at.

const cameras = (page: Page) => page.evaluate(() => ({
  ttc: document.querySelector<HTMLElement>(".ttc-map-stage")?.style.transform ?? null,
  regional: document.querySelector<HTMLElement>(".regional-map-stage")?.style.transform ?? null,
}));

const networkSwitch = (page: Page, isMobile: boolean) => isMobile
  ? page.locator(".mobile-map-network-switch")
  : page.locator("#desktop-sidebar-container");

test.beforeEach(async ({ page, request }) => {
  await installDismissedTransientUi(page);
  await setStubMode(request, "regional-live");
});

test("zooming one network leaves the hidden network's camera alone", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await networkSwitch(page, isMobile).getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  await expect(page.locator(".regional-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  // Leave GO/UP away from its fitted view so a stray Center would show too.
  const fitted = await cameras(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => (await cameras(page)).regional).not.toBe(fitted.regional);
  await networkSwitch(page, isMobile).getByRole("button", { name: "TTC", exact: true }).click();
  await waitForNetworkTransition(page, "ttc");

  const before = await cameras(page);
  expect(before.regional).toBeTruthy();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(async () => (await cameras(page)).ttc).not.toBe(before.ttc);
  await page.getByRole("button", { name: "Center map view", exact: true }).click();
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 500)));
  expect((await cameras(page)).regional).toBe(before.regional);
});

test("map controls pressed during a network switch move neither map", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await networkSwitch(page, isMobile).getByRole("button", { name: "GO/UP", exact: true }).click();
  await waitForNetworkTransition(page, "regional");
  await networkSwitch(page, isMobile).getByRole("button", { name: "TTC", exact: true }).click();
  await waitForNetworkTransition(page, "ttc");
  const before = await cameras(page);

  // Hold the destination's dashboard refresh so the switch is still running
  // when the rider presses zoom.
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/dashboard?network=regional*", async route => { await held; await route.continue(); });
  await networkSwitch(page, isMobile).getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network-switch-target", "regional");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  release();
  await waitForNetworkTransition(page, "regional");
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 300)));
  expect(await cameras(page)).toEqual(before);
});
