import { expect, test } from "@playwright/test";
import { installDismissedTransientUi } from "./test-support";

for (const width of [360, 430]) {
  test(`overview titles and close scroll together at ${width}px`, async ({ page, isMobile, request }) => {
    test.skip(!isMobile);
    await page.setViewportSize({ width, height: 640 });
    await installDismissedTransientUi(page);
    await request.post("http://127.0.0.1:4174/__test/mode", { data: { mode: "seeded" } });
    await page.goto("/");
    for (const menu of ["Status", "More"]) {
      await page.getByRole("button", { name: menu, exact: true }).click();
      const kind = menu.toLowerCase();
      const panel = page.locator(`.mobile-${kind}-sheet`);
      const scroll = panel.locator(`.mobile-${kind}-content-scroll`);
      const title = panel.locator("h2");
      const close = panel.getByRole("button", { name: menu === "Status" ? "Close status" : "Close more options", exact: true });
      await expect(panel).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `/tmp/linewatch-${kind}-header-${width}.png` });
      const titleBefore = (await title.boundingBox())!;
      const closeBefore = (await close.boundingBox())!;
      await scroll.evaluate(el => { el.scrollTop = 160; });
      await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(20);
      expect((await title.boundingBox())!.y).toBeLessThan(titleBefore.y - 20);
      const titleAfter = (await title.boundingBox())!;
      const closeAfter = (await close.boundingBox())!;
      expect(closeBefore.y - closeAfter.y).toBeCloseTo(titleBefore.y - titleAfter.y, 0);
      expect(closeBefore.width).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `/tmp/linewatch-${kind}-scroll-${width}.png` });
      await scroll.evaluate(el => { el.scrollTop = 0; });
      await expect(close).toBeInViewport();
      await close.click();
      await expect(panel).not.toBeVisible();
    }
  });
}
