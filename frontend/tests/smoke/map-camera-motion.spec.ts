import { expect, test, type Page } from "@playwright/test";
import type { NetworkId } from "../../src/app/dashboard-contract";
import { installDismissedTransientUi, setStubMode } from "./test-support";

// Drag momentum from the shared camera engine (components/map-camera), on both
// System Maps. Wheel easing and commit timing are unit-tested in
// tests/map-camera-motion.test.mjs.

const viewportSelector = (network: NetworkId) =>
  network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport";

async function openMap(page: Page, network: NetworkId) {
  await installDismissedTransientUi(page);
  await page.setViewportSize({ width: 2048, height: 1164 });
  await page.addInitScript((network) => {
    localStorage.setItem("linewatch-default-network-v1", network);
    localStorage.setItem("linewatch-map-view-v1", "diagram");
  }, network);
  await page.goto("/");
  await expect(page.locator(".linewatch-shell")).toHaveAttribute("data-network", network);
  await expect(page.locator(`.${network}-map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
  await page.getByRole("button", { name: "Center map view", exact: true }).click();
  await page.waitForTimeout(300);
}

function cameraX(page: Page, network: NetworkId) {
  return page.locator(`.${network}-map-stage`).evaluate(
    (stage) => new DOMMatrixReadOnly(getComputedStyle(stage).transform).e,
  );
}

const gestureActive = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-map-gesture-active="true"]') !== null);

/** A point on open map, clear of targets and controls, with room to drag left. */
function blankPoint(page: Page, network: NetworkId) {
  return page.evaluate((selector) => {
    const viewport = document.querySelector(selector)!;
    const box = viewport.getBoundingClientRect();
    for (const y of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      for (const x of [0.7, 0.6, 0.8, 0.5]) {
        const point = { x: box.left + box.width * x, y: box.top + box.height * y };
        const hit = document.elementFromPoint(point.x, point.y);
        if (hit && viewport.contains(hit) && !hit.closest(
          "button, a, input, [role='button'], [data-map-impact-kind], [data-regional-station-id], [data-station-id], .overlap-indicator, .map-segment-hit-target",
        )) return point;
      }
    }
    throw new Error("no open map point");
  }, viewportSelector(network));
}

/**
 * A visible point on a line alert whose target is on top there, on a nearly
 * horizontal stretch, so a sideways glide keeps the alert under the point.
 */
function alertPoint(page: Page, network: NetworkId) {
  return page.evaluate((selector) => {
    const viewport = document.querySelector(selector)!;
    const box = viewport.getBoundingClientRect();
    for (const path of document.querySelectorAll<SVGPathElement>(`${selector} .map-segment-hit-target`)) {
      const length = path.getTotalLength();
      const at = (fraction: number) => path.getPointAtLength(length * fraction).matrixTransform(path.getScreenCTM()!);
      for (let step = 4; step <= 16; step += 1) {
        const point = at(step / 20);
        const before = at((step - 2) / 20);
        const after = at((step + 2) / 20);
        if (Math.abs(after.y - before.y) > Math.abs(after.x - before.x) * 0.2) continue;
        if (point.x < box.left + 200 || point.x > box.right - 200 || point.y < box.top + 150 || point.y > box.bottom - 150) continue;
        if (document.elementFromPoint(point.x, point.y) === path) return { x: point.x, y: point.y, id: path.dataset.mapImpactId! };
      }
    }
    throw new Error("no visible horizontal line alert");
  }, viewportSelector(network));
}

/**
 * Drags left and releases while still moving. The last move and the release
 * go out together over CDP: Playwright's mouse steps can arrive 70 ms apart,
 * and a release that late after the last move is a stop, not a fling.
 */
async function fling(page: Page, from: { x: number; y: number }, steps = 10, stepPx = 30) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: "mousePressed" | "mouseMoved" | "mouseReleased", x: number) =>
    cdp.send("Input.dispatchMouseEvent", {
      type, x, y: from.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
    });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, button: "none" });
  await send("mousePressed", from.x);
  for (let i = 1; i < steps; i += 1) await send("mouseMoved", from.x - i * stepPx);
  const last = from.x - steps * stepPx;
  await Promise.all([send("mouseMoved", last), send("mouseReleased", last)]);
  await cdp.detach();
}

for (const network of ["ttc", "regional"] as const) {
  test.describe(`${network} camera motion`, () => {
    test.skip(({ isMobile }) => isMobile, "CDP mouse drags; touch flings share the same release path");

    test.beforeEach(async ({ request }) => {
      await setStubMode(request, "regional-live");
    });

    test("a drag released while moving glides on, then ends the gesture", async ({ page }) => {
      await openMap(page, network);
      await fling(page, await blankPoint(page, network));
      const released = await cameraX(page, network);
      expect(await gestureActive(page)).toBe(true);
      await expect.poll(() => gestureActive(page), { timeout: 4_000 }).toBe(false);
      const settled = await cameraX(page, network);
      expect(released - settled).toBeGreaterThan(40);
      await page.waitForTimeout(200);
      // The final commit may round to a device pixel; nothing keeps moving.
      expect(Math.abs(await cameraX(page, network) - settled)).toBeLessThan(0.5);
    });

    test("a press during a glide stops it and selects nothing", async ({ page }) => {
      await openMap(page, network);
      const selected = page.locator("[data-selected-impact-emphasis]");
      await expect(selected).toHaveCount(0);

      await fling(page, await blankPoint(page, network));
      expect(await gestureActive(page)).toBe(true);
      const target = await alertPoint(page, network);
      await page.mouse.click(target.x, target.y);
      const stopped = await cameraX(page, network);
      await page.waitForTimeout(300);
      expect(Math.abs(await cameraX(page, network) - stopped)).toBeLessThan(0.5);
      expect(await gestureActive(page)).toBe(false);
      await expect(selected).toHaveCount(0);

      // The same press with the map at rest selects the alert.
      const atRest = await alertPoint(page, network);
      await page.mouse.click(atRest.x, atRest.y);
      await expect(page.locator(`[data-selected-impact-emphasis="${atRest.id}"]`).first()).toBeAttached();
    });
  });
}
