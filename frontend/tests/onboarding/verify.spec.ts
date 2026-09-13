import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Check the actual first-visit slideshow after the new PNGs have been published.
test("refreshed slideshow images load and fit", async ({ page, isMobile }, testInfo) => {
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "Welcome to LineWatchTO" });
  await expect(welcome).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const carousel = welcome.locator(`.opening-welcome-carousel--${isMobile ? "mobile" : "desktop"}`);
  const previewDir = path.resolve("../artifacts/onboarding");
  await mkdir(previewDir, { recursive: true });
  for (let index = 0; index < (isMobile ? 4 : 3); index++) {
    const slide = carousel.locator(".opening-welcome-slide-item--active");
    await expect(slide).toHaveAttribute("data-slide-index", String(index));
    const images = slide.locator("img");
    for (const img of await images.all()) {
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
      if ((await img.getAttribute("src"))?.includes("onboarding") || (await img.getAttribute("src"))?.includes("desktop-") || (await img.getAttribute("src"))?.includes("mobile-")) {
        await expect(img).toHaveAttribute("src", /(?:%2F|\/)static(?:%2F|\/)media/);
      }
      const bounds = await img.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
    await carousel.getByRole("button", { name: index === (isMobile ? 3 : 2) ? "Explore dashboard" : "Next", exact: true }).waitFor({ state: "visible" });
    await welcome.screenshot({ path: path.join(previewDir, `${testInfo.project.name}-slide-${index + 1}.png`), animations: "disabled" });
    if (index < (isMobile ? 3 : 2)) await carousel.getByRole("button", { name: "Next", exact: true }).click();
  }
});
