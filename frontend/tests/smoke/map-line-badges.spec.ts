import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

const inspectionDirectory = "/tmp/linewatch-line-badge-inspection";

test.beforeEach(async ({ page, request }, testInfo) => {
  await setStubMode(request, "seeded");
  await installDismissedTransientUi(page);
  await mkdir(inspectionDirectory, { recursive: true });
  await page.setViewportSize(testInfo.project.name.includes("mobile")
    ? { width: 360, height: 800 }
    : { width: 1440, height: 900 });
});

test("system-map badges fade independently at calibrated diagram scales", async ({ page }, testInfo) => {
  await page.goto("/");
  const stage = page.locator(".ttc-map-stage");
  await expect(stage).toHaveAttribute("data-raster-map-ready", "true", { timeout: 15_000 });
  const badgePlane = page.locator(".raster-map-plane--badges");
  const labelPlane = page.locator(".raster-map-plane--labels");
  const foregroundPlane = page.locator(".raster-map-plane--foreground");
  await expect(badgePlane).toHaveCSS("pointer-events", "none");
  const slider = page.locator('input[aria-label="Zoom level slider"]');
  for (const [scale, expectedOpacity, suffix] of [
    [1, 1, "overview"],
    [1.7, 0.5, "intermediate"],
    [2.5, 0, "detail"],
  ] as const) {
    await slider.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, scale);
    await expect.poll(async () => Number(await badgePlane.evaluate((element) => getComputedStyle(element).opacity)))
      .toBeCloseTo(expectedOpacity, 2);
    await expect(labelPlane).toHaveCSS("opacity", "1");
    await expect(foregroundPlane).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: `${inspectionDirectory}/${testInfo.project.name}-diagram-${suffix}.png`,
      animations: "disabled",
    });
  }
});

test("TTC and regional geographic badges render from overview through their detail cutoff", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("linewatch-map-view-v1", "geographic"));
  await page.goto("/");
  const map = page.locator(".geographic-network-map");
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
  const slider = page.locator('input[aria-label="Zoom level slider"]');

  for (const [zoom, suffix] of [[10, "overview"], [12, "intermediate"], [14, "detail"]] as const) {
    await slider.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, zoom);
    await expect(slider).toHaveValue(String(zoom));
    await page.screenshot({
      path: `${inspectionDirectory}/${testInfo.project.name}-geographic-${suffix}.png`,
      animations: "disabled",
    });
  }

  await expect(map.locator("canvas")).toBeVisible();

  const networkSelector = testInfo.project.name.includes("mobile")
    ? page.locator(".mobile-map-network-switch")
    : page.getByRole("group", { name: "Select transit network" }).first();
  await networkSelector.getByRole("button", { name: "GO/UP", exact: true }).click();
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", "regional");
  await expect(map).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
  await expect(slider).toHaveValue("9");
  await page.screenshot({
    path: `${inspectionDirectory}/${testInfo.project.name}-geographic-regional-overview.png`,
    animations: "disabled",
  });
});
