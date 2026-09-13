import { expect, test } from "@playwright/test";

for (const width of [375, 393, 430]) {
  test(`mobile legend expands horizontally at ${width}px`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile legend only");
    await page.setViewportSize({ width, height: 851 });
    await page.addInitScript(() => {
      localStorage.setItem("linewatch-welcome-seen-v1", "true");
      localStorage.setItem("linewatch-unofficial-notice-ack-v1", "true");
    });
    await page.goto(`${process.env.LINEWATCH_LEGEND_TEST_ORIGIN ?? ""}/?previewTime=2026-08-14T16:00:00.000Z`);
    for (const network of ["TTC", "GO/UP"]) {
      if (network === "GO/UP") {
        await page.locator(".network-selector--compact-vertical").getByRole("button", { name: network, exact: true }).click();
      }
      const legend = page.locator(".mobile-legend-pill");
      await expect(legend).toHaveClass(network === "GO/UP" ? /mobile-legend-pill--regional/ : /mobile-legend-pill/);
      await expect(legend.locator(".mobile-legend-route-badge")).toHaveCount(network === "TTC" ? 5 : 8);
      const toggle = legend.getByRole("button", { name: "Transit line legend", exact: true });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect.poll(async () => (await legend.boundingBox())!.x).toBe(width <= 400 ? 10 : 16);
      const before = (await legend.boundingBox())!;
      const badgeBefore = await legend.locator(".mobile-legend-route-badge").first().boundingBox();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect.poll(async () => (await legend.boundingBox())!.width).toBeGreaterThan(before.width + 100);
      const after = (await legend.boundingBox())!;
      expect(after.height).toBe(before.height);
      expect(after.y).toBe(before.y);
      expect(after.x).toBe(before.x);
      expect(await legend.locator(".mobile-legend-route-badge").first().boundingBox()).toEqual(badgeBefore);
      await expect(legend.getByRole("navigation").getByRole("button")).toHaveCount(network === "TTC" ? 5 : 8);
      await page.screenshot({ path: `/tmp/legend-${width}-${network === "TTC" ? "ttc" : "regional"}.png` });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect.poll(async () => (await legend.boundingBox())!.width).toBe(before.width);
      expect((await legend.boundingBox())!.height).toBe(before.height);
    }
  });
}
