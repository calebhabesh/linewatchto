import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

for (const network of ["ttc", "regional"] as const) {
  test(`${network} diagram follows the same eased desktop drag`, async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop drag motion is checked at a desktop viewport.");
    await installDismissedTransientUi(page);
    await page.addInitScript((networkValue) => {
      localStorage.setItem("linewatch-default-network-v1", networkValue);
    }, network);
    await setStubMode(request, "seeded");
    await page.goto("/");

    const stage = page.locator(network === "ttc" ? ".ttc-map-stage" : ".regional-map-stage");
    const viewport = page.locator(network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport");
    await expect(stage).toHaveAttribute("data-raster-map-ready", "true");
    const bounds = await viewport.boundingBox();
    expect(bounds).not.toBeNull();
    const start = { x: bounds!.x + bounds!.width * 0.75, y: bounds!.y + bounds!.height * 0.55 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect.poll(() => stage.evaluate((element) => ({
      property: getComputedStyle(element).transitionProperty,
      duration: getComputedStyle(element).transitionDuration,
    }))).toEqual({ property: "transform", duration: "0.1s" });
    const before = await stage.evaluate((element) => element.style.transform);
    await page.mouse.move(start.x + 50, start.y + 30, { steps: 6 });
    await expect.poll(() => stage.evaluate((element) => element.style.transform)).not.toBe(before);
    await page.mouse.up();
  });

  test(`${network} geographic view still pans with its shared map handler`, async ({ page, request, isMobile }) => {
    test.skip(isMobile, "Desktop pointer drag is checked at a desktop viewport.");
    await installDismissedTransientUi(page);
    await page.addInitScript((networkValue) => {
      localStorage.setItem("linewatch-default-network-v1", networkValue);
      localStorage.setItem("linewatch-map-view-v1", "geographic");
    }, network);
    await setStubMode(request, "seeded");
    await page.goto("/");

    const map = page.locator(".geographic-network-map");
    await expect(map).toHaveAttribute("data-status", "ready", { timeout: 15_000 });
    const before = await page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera());
    expect(before).toBeDefined();
    const bounds = await map.locator("canvas").boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width * 0.55, bounds!.y + bounds!.height * 0.6, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__linewatchGeographicMapLifecycle?.getCamera())).not.toEqual(before);
  });
}
