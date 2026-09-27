import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test("station cycles release canvases, listeners and document nodes", async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.clearRect;
    Object.assign(window, { detachedCanvasDraws: 0 });
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (!this.canvas.isConnected) (window as unknown as { detachedCanvasDraws: number }).detachedCanvasDraws++;
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  const session = await page.context().newCDPSession(page);
  const metrics = async () => {
    await session.send("HeapProfiler.collectGarbage");
    return session.send("Memory.getDOMCounters");
  };
  const cycle = async () => {
    await page.getByRole("button", { name: "Stub Station station details", exact: true }).dispatchEvent("click");
    const sheet = page.locator(".station-detail-panel");
    const handle = sheet.getByRole("slider");
    await expect(handle).toBeVisible();
    await expect.poll(() => sheet.evaluate(el => el.getAnimations().length)).toBe(0);
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 70, { steps: 5 });
    await page.mouse.up();
    await handle.press("Home");
    await sheet.getByRole("button", { name: "Close station details" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator(".mobile-service-sheet")).toBeVisible();
    // Let the finite exit/entry effects and their delayed releases complete.
    await page.waitForTimeout(350);
  };
  await cycle();
  const before = await metrics();
  for (let i = 0; i < 10; i++) await cycle();
  const after = await metrics();
  console.log("station lifecycle", { before, after });
  expect(after.jsEventListeners - before.jsEventListeners).toBeLessThan(20);
  expect(after.nodes - before.nodes).toBeLessThan(100);
  expect(await page.evaluate(() => (window as unknown as { detachedCanvasDraws: number }).detachedCanvasDraws)).toBe(0);
});
