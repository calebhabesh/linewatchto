import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

for (const network of ["ttc", "regional"] as const) {
  test(`${network} alert chooser fits compact viewports and clears visible controls`, async ({ page, request, isMobile }, testInfo) => {
    await installDismissedTransientUi(page);
    await setStubMode(request, "regional-live");
    await page.addInitScript(network => localStorage.setItem("linewatch-default-network-v1", network), network);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const widths = isMobile ? [360, 640, 641] : [1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: isMobile ? 800 : 900 });
      await page.goto("/");
      const layer = page.locator(`[data-network-map-layer='${network}']`);
      await expect(layer).toHaveAttribute("data-map-ready", "true");
      await layer.locator(".overlap-indicator").first().dispatchEvent("click");
      const chooser = page.locator("[data-overlap-chooser]");
      await expect(chooser).toBeVisible();
      await expect.poll(() => chooser.evaluate(element => element.getAnimations().length)).toBe(0);
      await expect.poll(() => chooser.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return Array.from(document.querySelectorAll<HTMLElement>("[data-map-chooser-keepout], .mobile-status-peek, .desktop-sidebar-container:not(.desktop-sidebar-container--collapsed)"))
          .filter(control => control.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
          .filter(control => {
            const box = control.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top;
          }).map(control => control.className);
      })).toEqual([]);
      const box = (await chooser.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      if (width <= 640) expect(box.width).toBeLessThanOrEqual(Math.min(320, width - 32));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const screenshotPath = testInfo.outputPath(`${network}-chooser-${width}.png`);
      await page.screenshot({ path: screenshotPath });
      await testInfo.attach(`${network}-chooser-${width}`, { path: screenshotPath, contentType: "image/png" });
    }
  });
}
