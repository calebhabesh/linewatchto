import { expect, test, type Locator } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

async function glyphFrames(glyphs: Locator) {
  return glyphs.evaluateAll(elements => elements.map(element => {
    const glyph = element as SVGGraphicsElement;
    const matrix = glyph.ownerSVGElement!.getCTM()!.inverse().multiply(glyph.getCTM()!);
    return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
  }));
}

function expectSameGlyphFrames(actual: number[][], expected: number[][]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((frame, index) => frame.forEach((value, component) => {
    // Tangent sampling and SVG float precision allow at most one degree of
    // rotation or one authored map unit of position difference.
    expect(Math.abs(value - expected[index][component])).toBeLessThan(component < 4 ? 0.02 : 1);
  }));
}

test.beforeEach(async ({ page, request, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 360, height: 780 } : { width: 1440, height: 900 });
  await installDismissedTransientUi(page);
  await setStubMode(request, "seeded");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.removeItem("linewatch-reduced-motion-enabled-v1");
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args: Parameters<typeof clear>) {
      if (this.canvas.classList.contains("constellation-background-canvas")) {
        const probe = window as Window & { backgroundFrames?: number[] };
        (probe.backgroundFrames ??= []).push(performance.now());
      }
      return Reflect.apply(clear, this, args);
    };
  });
});

test("diagram keeps every alert symbol at rest, selected or not, at the same glyph density", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-system-map=ttc] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator("[data-glyph-lane] > g").first()).toBeAttached();
  await expect(page.locator("[data-system-map=ttc] .map-stage animateMotion")).toHaveCount(0);
  // The station beacon ping is the one idle loop (paint only; it moves
  // nothing). No other overlay runs one at rest.
  await expect.poll(() => page.locator("[data-system-map=ttc] .map-stage").evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity)
    .map(animation => ("animationName" in animation ? String(animation.animationName) : "unnamed"))
    .filter(name => name !== "station-alert-beacon-ping")))
    .toEqual([]);
  const corridor = page.locator('.overlay-segment-group[data-map-impact-id="reduced-speed-zone-stub-union-curve"]');
  const glyphs = corridor.locator("[data-glyph-lane] > g");
  const count = await glyphs.count();
  expect(count).toBeGreaterThan(8);
  const resting = await glyphFrames(glyphs);
  // Selecting an alert highlights it; its glyphs stay where they are.
  await page.getByRole("button", { name: "reduced-speed-zone: King to Union" }).press("Enter");
  await expect(glyphs).toHaveCount(count);
  await expect(page.locator("[data-system-map=ttc] .map-stage animateMotion")).toHaveCount(0);
  expectSameGlyphFrames(await glyphFrames(glyphs), resting);
});

test("directional planned calendars keep their glyph density and stay at rest when selected", async ({ page }) => {
  await page.route("**/api/dashboard?network=ttc", async route => {
    const response = await route.fetch();
    const dashboard = await response.json();
    dashboard.plannedClosures = dashboard.plannedClosures.map((closure: { id: string }) =>
      closure.id === "stub-upcoming-closure-line-1" ? { ...closure, travelDirection: "reverse" } : closure);
    await route.fulfill({ response, json: dashboard });
  });
  await page.goto("/");
  const corridor = page.locator('.overlay-segment-group[data-map-impact-id="stub-upcoming-closure-line-1"]');
  const glyphs = corridor.locator(".planned-closure-lane-glyph > g");
  await expect(glyphs.first()).toBeAttached();
  const count = await glyphs.count();
  expect(count).toBeGreaterThan(8);
  const resting = await glyphFrames(glyphs);
  await page.getByRole("button", { name: "Stub API upcoming weekend closure: Stub Station to Stub Terminal" }).press("Enter");
  await expect(glyphs).toHaveCount(count);
  await expect(corridor.locator("animateMotion")).toHaveCount(0);
  expectSameGlyphFrames(await glyphFrames(glyphs), resting);
});

test("incident cards stay still at rest, on hover and on focus", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop status rail incident cards");
  await page.goto("/");
  const card = page.locator(".desktop-status-incident-row:visible").first();
  await expect(card).toBeVisible();
  const running = () => card.evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity).length);
  await expect(card.locator("canvas")).toHaveCount(0);
  expect(await running()).toBe(0);
  await card.hover();
  expect(await running()).toBe(0);
  await card.focus();
  expect(await running()).toBe(0);
});

test("canvas motion is paced and stops during sheet gestures and page suspension", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator("[data-system-map=ttc] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  const frames = () => page.evaluate(() => (window as Window & { backgroundFrames?: number[] }).backgroundFrames ?? []);
  await expect.poll(async () => (await frames()).length).toBeGreaterThan(0);
  await page.evaluate(() => { (window as Window & { backgroundFrames?: number[] }).backgroundFrames = []; });
  await page.waitForTimeout(600);
  const paced = await frames();
  expect(paced.length).toBeLessThanOrEqual(13);
  if (isMobile) expect(paced.length).toBe(0);
  else expect(paced.length).toBeGreaterThan(0);
  for (let index = 1; index < paced.length; index++) {
    expect(paced[index] - paced[index - 1]).toBeGreaterThanOrEqual(49);
  }
  const signal = (paused: boolean) => page.evaluate(value => {
    window.dispatchEvent(new CustomEvent("linewatch:sheet-motion", { detail: { paused: value } }));
  }, paused);
  await signal(true);
  const pausedFrames = (await frames()).length;
  await page.waitForTimeout(250);
  expect((await frames()).length).toBe(pausedFrames);
  await signal(false);
  await expect.poll(async () => (await frames()).length).toBeGreaterThan(pausedFrames);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  const hiddenFrames = (await frames()).length;
  await page.waitForTimeout(250);
  expect((await frames()).length).toBe(hiddenFrames);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await expect.poll(async () => (await frames()).length).toBeGreaterThan(hiddenFrames);
});
