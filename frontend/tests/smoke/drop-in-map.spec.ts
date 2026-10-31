import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { mapArtworkUrl } from "../../src/app/map-manifests";
import manifest from "../fixtures/drop-in-map/drop-in-map-manifest";

/*
 * Drop-in proof (plan 10 phase 6): a third System Map from an SVG, a manifest,
 * its prepared geometry and an existing network adapter (TTC's), rendered by
 * the engine with no map-specific code. The harness route exists only in the
 * Playwright build (LINEWATCH_TEST_HARNESS); the test serves the fixture SVG at
 * its manifest URL. Its data is fixture data: a suspension and a delay share
 * Alder to Birch, and a delay runs Birch to Elm.
 */

const HARNESS = "/test-harness/drop-in-map";
const ROOT = `[data-system-map="${manifest.id}"]`;
const VIEWPORT = `${ROOT} .system-map-viewport`;
const STAGE = `${ROOT} .map-stage`;
const svg = readFileSync(new URL(`../../${manifest.svg}`, import.meta.url), "utf8");

type Point = { x: number; y: number };

async function openMap(page: Page) {
  await page.route(`**${mapArtworkUrl(manifest)}*`, (route) => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  const response = await page.goto(HARNESS);
  expect(response?.status(), "the harness route needs a build with LINEWATCH_TEST_HARNESS=true").toBe(200);
  await expect(page.locator(STAGE)).toBeVisible();
  await settle(page);
}

async function settle(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.querySelector('[data-map-gesture-active="true"], [data-map-camera-moving="true"]') === null,
  ), { timeout: 4_000 }).toBe(true);
  await page.waitForTimeout(250);
}

function camera(page: Page) {
  return page.locator(STAGE).evaluate((stage) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
}

const selected = (page: Page) => page.getByTestId("drop-in-selection");

/** A station's target centre on screen. */
async function stationPoint(page: Page, stationId: string): Promise<Point> {
  const box = (await page.locator(`${ROOT} .station-hit-target[data-station-id="${stationId}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A point along an alert's target, inside the viewport, with the target on top there. */
function alertPoint(page: Page, impactId: string) {
  return page.evaluate(({ viewport, impactId }) => {
    const box = document.querySelector(viewport)!.getBoundingClientRect();
    const path = document.querySelector<SVGPathElement>(`${viewport} .map-segment-hit-target[data-map-impact-id="${impactId}"]`)!;
    for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const point = path.getPointAtLength(path.getTotalLength() * fraction).matrixTransform(path.getScreenCTM()!);
      const inside = point.x > box.left + 80 && point.x < box.right - 80 && point.y > box.top + 100 && point.y < box.bottom - 60;
      if (inside && document.elementFromPoint(point.x, point.y) === path) return { x: point.x, y: point.y };
    }
    throw new Error(`no visible point on alert ${impactId}`);
  }, { viewport: VIEWPORT, impactId });
}

async function badgePoint(page: Page): Promise<Point> {
  const box = (await page.locator(`${ROOT} .overlap-indicator`).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Open map: below Alder's name, clear of every target. */
function blankPoint(page: Page): Promise<Point> {
  return page.evaluate((viewport) => {
    const box = document.querySelector(viewport)!.getBoundingClientRect();
    for (const [x, y] of [[0.3, 0.8], [0.7, 0.2], [0.2, 0.3], [0.8, 0.85]]) {
      const point = { x: box.left + box.width * x, y: box.top + box.height * y };
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit && !hit.closest("button, [data-station-id], [data-station-label-id], .overlap-indicator, .map-segment-hit-target")) return point;
    }
    throw new Error("no open map point");
  }, VIEWPORT);
}

test.use({ serviceWorkers: "block" });

test.describe("drop-in System Map", () => {
  test("renders from its manifest: the authored SVG paints, and stations, names and alerts get targets", async ({ page }) => {
    await openMap(page);
    const stage = page.locator(STAGE);
    // No raster planes: the entrance does not wait for any, and the SVG paints.
    await expect(stage).toHaveAttribute("data-raster-planes", "none");
    await expect(stage).toHaveAttribute("data-raster-map-ready", "true");
    await expect(page.locator(`${ROOT} .raster-map-plane`)).toHaveCount(0);
    await expect(page.locator(`${ROOT} .map-authored-svg`)).toHaveCount(2);
    await expect(page.locator(`${ROOT} .map-authored-svg`).first()).toHaveCSS("visibility", "visible");
    // Its stations and names paint over the overlays, as raster planes would;
    // every authored id stays unique in the page.
    const layering = await page.evaluate((stage) => {
      const planes = [...document.querySelector(stage)!.children];
      const overlay = planes.findIndex((plane) => plane.classList.contains("map-overlay-plane"));
      const station = planes.findIndex((plane) => plane.querySelector("#station-alder"));
      const line = planes.findIndex((plane) => plane.querySelector("#line-a"));
      const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
      return { line, overlay, station, duplicates: ids.filter((id, index) => ids.indexOf(id) !== index) };
    }, STAGE);
    expect(layering.line).toBeLessThan(layering.overlay);
    expect(layering.station).toBeGreaterThan(layering.overlay);
    expect(layering.duplicates).toEqual([]);
    await expect(page.locator(`${ROOT} .station-hit-target`)).toHaveCount(5);
    await expect(page.locator(`${ROOT} .station-label-hit-target`)).toHaveCount(5);
    await expect(page.locator(`${ROOT} .map-segment-hit-target[data-map-impact-id="d2"]`)).toHaveCount(1);
    await expect(page.locator(`${ROOT} .overlap-indicator`)).toHaveCount(1);
    await expect(page.getByRole("region", { name: manifest.label })).toBeVisible();
  });

  test.describe("pointer", () => {
    test.skip(({ isMobile }) => isMobile, "mouse hover and wheel");
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the camera fits the drawing, zooms about the pointer and pans", async ({ page }) => {
      await openMap(page);
      // The default frame shows the manifest's content bounds, centred.
      const viewport = (await page.locator(VIEWPORT).boundingBox())!;
      const fitted = await camera(page);
      const { contentBounds } = manifest;
      const left = viewport.x + fitted.x + contentBounds.x * fitted.scale;
      const right = left + contentBounds.width * fitted.scale;
      expect(left).toBeGreaterThanOrEqual(viewport.x - 1);
      expect(right).toBeLessThanOrEqual(viewport.x + viewport.width + 1);
      expect(Math.abs((left + right) / 2 - (viewport.x + viewport.width / 2))).toBeLessThan(2);

      const point = await blankPoint(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: point.x, y: point.y, deltaX: 0, deltaY: -100 });
      await cdp.detach();
      await settle(page);
      const zoomed = await camera(page);
      expect(zoomed.scale / fitted.scale).toBeCloseTo(1.1, 2);

      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.mouse.move(point.x - 120, point.y - 60, { steps: 8 });
      await page.waitForTimeout(200);
      await page.mouse.up();
      await settle(page);
      const panned = await camera(page);
      expect(panned.x - zoomed.x).toBeCloseTo(-120, 0);
      expect(panned.y - zoomed.y).toBeCloseTo(-60, 0);
      await expect(selected(page)).toHaveAttribute("data-selection", "");

      await page.getByRole("button", { name: "Center map view", exact: true }).click();
      await settle(page);
      expect((await camera(page)).scale).toBeCloseTo(fitted.scale, 3);
    });

    test("hovering a station rings it and lifts its authored name; hovering an alert lights it", async ({ page }) => {
      await openMap(page);
      const birch = await stationPoint(page, "birch");
      await page.mouse.move(birch.x, birch.y);
      await expect(page.locator(`${STAGE} .station-hover-indicator.active`)).toHaveCount(1);
      // No label texture: the lifted name is the authored label itself.
      const lifted = page.locator(`${STAGE} .raster-station-label-text-hover`);
      await expect(lifted).toHaveAttribute("data-hover-active", "true");
      await expect(lifted.locator("use")).toHaveAttribute("href", "#station-label-birch");

      const delay = await alertPoint(page, "d2");
      await page.mouse.move(delay.x, delay.y, { steps: 4 });
      await expect(page.locator('[data-map-hover-impact-id="d2"][data-map-impact-hovered="true"]').first()).toBeAttached();
      await expect(page.locator(`${STAGE} .station-hover-indicator.active`)).toHaveCount(0);
      const blank = await blankPoint(page);
      await page.mouse.move(blank.x, blank.y, { steps: 4 });
      await expect(page.locator('[data-map-impact-hovered="true"]')).toHaveCount(0);
    });

    test("pressing a station or an alert selects it; pressing open map clears it", async ({ page }) => {
      await openMap(page);
      const elm = await stationPoint(page, "elm");
      await page.mouse.click(elm.x, elm.y);
      await expect(selected(page)).toHaveAttribute("data-station", "elm");
      await expect(page.locator(`${STAGE} .station-selection-flash`)).toHaveCount(1);
      await settle(page);

      const delay = await alertPoint(page, "d2");
      await page.mouse.click(delay.x, delay.y);
      await expect(selected(page)).toHaveAttribute("data-selection", "delay:d2");
      await expect(page.locator('[data-selected-impact-emphasis="d2"]').first()).toBeAttached();
      await settle(page);

      const blank = await blankPoint(page);
      await page.mouse.click(blank.x, blank.y);
      await expect(selected(page)).toHaveAttribute("data-selection", "");
      await expect(page.locator("[data-selected-impact-emphasis]")).toHaveCount(0);
    });

    test("the overlap badge opens the chooser; a choice selects its alert; Escape closes it", async ({ page }) => {
      await openMap(page);
      const badge = await badgePoint(page);
      await page.mouse.click(badge.x, badge.y);
      const chooser = page.getByRole("dialog", { name: /^Choose Alert on / });
      await expect(chooser).toBeVisible();
      // The two alerts on Alder to Birch, and the Birch to Elm delay that meets them at Birch.
      const choices = chooser.locator(".overlap-chooser-choice");
      await expect(choices.filter({ hasText: "Alder" })).toHaveCount(2);
      await expect(choices.filter({ hasText: "Suspension" })).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(chooser).toHaveCount(0);

      await settle(page);
      const again = await badgePoint(page);
      await page.mouse.click(again.x, again.y);
      await expect(chooser).toBeVisible();
      await chooser.locator(".overlap-chooser-choice").first().click();
      await expect(chooser).toHaveCount(0);
      await expect(selected(page)).toHaveAttribute("data-selection", "suspension:s1");
    });
  });

  test.describe("touch", () => {
    test.skip(({ isMobile }) => !isMobile, "touch");

    test("tapping a station selects it, and tapping the overlap badge opens the chooser", async ({ page }) => {
      await openMap(page);
      const dogwood = await stationPoint(page, "dogwood");
      await page.touchscreen.tap(dogwood.x, dogwood.y);
      await expect(selected(page)).toHaveAttribute("data-station", "dogwood");
      await settle(page);
      const badge = await badgePoint(page);
      await page.touchscreen.tap(badge.x, badge.y);
      await expect(page.getByRole("dialog", { name: /^Choose Alert on / })).toBeVisible();
    });
  });
});
