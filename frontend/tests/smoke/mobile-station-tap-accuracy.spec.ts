import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page, request, isMobile }) => {
  test.skip(!isMobile);
  await installDismissedTransientUi(page);
  await setStubMode(request, "unavailable");
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator(".ttc-map-entrance-reveal--ready")).toBeAttached();
});

test("a dot tap cannot activate a different label through its retargeted follow-up click", async ({ page }) => {
  const dot = page.locator('.station-hit-target[data-station-id="museum"]');
  await dot.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 45 });
  await dot.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 45 });
  const sheet = page.locator(".station-detail-panel");
  await expect(sheet.locator("h2").first()).toHaveText("Museum");
  // Android can retarget the synthesized click after the pointerup camera focus.
  const label = page.locator('.station-label-hit-target[data-station-label-id="st-andrew"]');
  await label.dispatchEvent("click", { detail: 1 });
  await expect(sheet.locator("h2").first()).toHaveText("Museum");
  // Consuming that click must allow the next intentional label tap.
  await label.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 46 });
  await label.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 46 });
  await label.dispatchEvent("click", { detail: 1 });
  await expect(sheet.locator("h2").first()).toHaveText("St Andrew");
});

test("native Android finger taps select the touched dots after repeated sheet closes", async ({ page }) => {
  test.setTimeout(60000);
  const session = await page.context().newCDPSession(page);
  for (let attempt = 0; attempt < 16; attempt++) {
    const targets = await page.locator(".station-hit-target").evaluateAll(elements => elements.flatMap(element => {
      const dot = element as SVGCircleElement;
      const point = new DOMPoint(dot.cx.baseVal.value, dot.cy.baseVal.value).matrixTransform(dot.getScreenCTM()!);
      if (document.elementFromPoint(point.x, point.y) !== dot || point.x < 65 || point.x > 295 || point.y < 160 || point.y > 490) return [];
      const primary = document.querySelector(`[data-station-id="${dot.dataset.stationId}"][aria-label]`)!;
      return [{ x: point.x, y: point.y, name: primary.getAttribute("aria-label")!.replace(/ station details$/, "") }];
    }));
    expect(targets.length).toBeGreaterThan(0);
    const target = targets[attempt % targets.length];
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: target.x, y: target.y, radiusX: 12, radiusY: 12, id: 1 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const sheet = page.locator(".station-detail-panel");
    await expect(sheet.locator("h2").first()).toHaveText(target.name);
    await sheet.getByRole("button", { name: "Close station details" }).tap();
    await expect(sheet).toHaveCount(0);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  await session.detach();
});
