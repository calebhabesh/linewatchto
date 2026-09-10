import { expect, test } from "@playwright/test";
import { installDismissedTransientUi } from "./test-support";

test("service sheet expands by tap, keyboard and drag without moving the map", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.goto("/");
  const sheet = page.locator(".mobile-service-sheet");
  const nav = page.getByRole("navigation", { name: "Primary mobile navigation" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-expanded", "false");
  const navBox = (await nav.boundingBox())!;
  expect(Math.abs(navBox.y + navBox.height - page.viewportSize()!.height)).toBeLessThan(2);
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "/tmp/linewatch-console-peek.png" });
  const camera = page.locator(".ttc-map-stage");
  const before = await camera.getAttribute("style");
  await page.getByRole("button", { name: "Expand service sheet" }).click();
  await expect(sheet).toHaveAttribute("data-expanded", "true");
  await expect(page.locator("#mobile-service-sheet-details")).not.toHaveAttribute("inert");
  await page.waitForTimeout(300);
  expect(await camera.getAttribute("style")).toBe(before);
  await page.screenshot({ path: "/tmp/linewatch-console-expanded.png" });
  const handle = page.getByRole("button", { name: "Collapse service sheet" });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(sheet).toHaveAttribute("data-expanded", "false");
  await page.waitForTimeout(300);
  const box = (await page.getByRole("button", { name: "Expand service sheet" }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const layoutHeight = await sheet.evaluate(node => (node as HTMLElement).offsetHeight);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 330, { steps: 12 });
  await expect(sheet).toHaveAttribute("data-dragging", "true");
  expect(await sheet.evaluate(node => (node as HTMLElement).offsetHeight)).toBe(layoutHeight);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-expanded", "true");
});

for (const preference of ["system", "app"] as const) {
  test(`station sheet remains draggable with ${preference} reduced motion`, async ({ page, request, isMobile }) => {
    test.skip(!isMobile);
    await installDismissedTransientUi(page);
    await request.post("http://127.0.0.1:4174/__test/mode", { data: { mode: "seeded" } });
    if (preference === "system") await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    if (preference === "app") await page.locator(".linewatch-shell").evaluate(el => el.classList.add("motion-paused"));
    await page.getByRole("button", { name: "Stub Station station details" }).dispatchEvent("click");
    const panel = page.locator(".station-detail-panel");
    await expect(panel).toBeVisible();
    const before = (await panel.boundingBox())!;
    expect(before.y).toBeGreaterThan(page.viewportSize()!.height * .2);
    const handle = page.getByRole("slider", { name: "Adjust station panel height" });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 120, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeLessThan(before.y - 60);
    await handle.press("Home");
    await expect.poll(async () => Math.abs((await panel.boundingBox())!.y - before.y)).toBeLessThan(3);
  });
}

test("mobile constellation does not redraw continuously", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains("constellation-background-canvas")) {
        this.canvas.dataset.testDraws = String(Number(this.canvas.dataset.testDraws ?? 0) + 1);
      }
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  const canvas = page.locator(".constellation-background-canvas");
  await expect(canvas).toBeAttached();
  await expect(canvas).toHaveAttribute("data-test-draws", /[1-9]/);
  await page.waitForTimeout(300);
  const draws = await canvas.getAttribute("data-test-draws");
  await page.waitForTimeout(500);
  expect(await canvas.getAttribute("data-test-draws")).toBe(draws);
});

test("sheet dragging pauses decorative loops and resumes them after settling", async ({ page, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await page.goto("/");
  await expect(page.locator(".mobile-service-sheet")).toBeVisible();
  await page.locator(".mobile-bottom-nav").evaluate(element => {
    const effect = element.animate([{ opacity: .99 }, { opacity: 1 }], { duration: 1000, iterations: Infinity });
    effect.id = "test-decoration";
  });
  const state = () => page.evaluate(() => document.getAnimations().find(animation => animation.id === "test-decoration")?.playState);
  const handle = (await page.getByRole("button", { name: "Expand service sheet" }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 10);
  await page.mouse.down();
  await expect.poll(state).toBe("paused");
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(state).toBe("running");
});
