import { expect, test, type Locator, type Page } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

async function borderDraws(page: Page) {
  return page.evaluate(() => (window as Window & { borderDraws?: number }).borderDraws ?? 0);
}

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
    const original = CanvasRenderingContext2D.prototype.stroke;
    CanvasRenderingContext2D.prototype.stroke = function (...args: [] | [Path2D]) {
      if (this.canvas.classList.contains("eb-canvas")) {
        const probe = window as Window & { borderDraws?: number };
        probe.borderDraws = (probe.borderDraws ?? 0) + 1;
      }
      return Reflect.apply(original, this, args);
    };
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

test("diagram keeps unfocused symbols static and preserves selected corridor glyph density", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
  await expect(page.locator("[data-motion-glyph-lane] > g").first()).toBeAttached();
  await expect(page.locator(".ttc-map-stage animateMotion")).toHaveCount(0);
  await expect.poll(() => page.locator(".ttc-map-stage").evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === "running" && animation.effect?.getTiming().iterations === Infinity).length))
    .toBe(0);
  await page.getByRole("button", { name: "delay: Spadina to St George" }).press("Enter");
  await expect.poll(() => page.locator(".ttc-map-stage animateMotion").count()).toBeGreaterThan(0);
  await expect(page.locator('[data-map-impact-id]').filter({ has: page.locator("animateMotion") })).toHaveCount(1);
  const otherCorridors = page.locator('[data-map-impact-id]').filter({ hasNot: page.locator("animateMotion") });
  expect(await otherCorridors.count()).toBeGreaterThan(0);
  const target = page.getByRole("button", { name: "reduced-speed-zone: King to Union" });
  const corridor = page.locator('[data-map-impact-id="reduced-speed-zone-stub-union-curve"]');
  const glyphs = corridor.locator("[data-motion-glyph-lane] > g");
  const idleCount = await glyphs.count();
  expect(idleCount).toBeGreaterThan(8);
  await glyphs.first().evaluate(element => {
    const svg = (element as SVGGraphicsElement).ownerSVGElement!;
    svg.pauseAnimations();
    svg.setCurrentTime(137);
  });
  const restingFrames = await glyphFrames(glyphs);
  await target.press("Enter");
  await expect(glyphs).toHaveCount(idleCount);
  await expect.poll(() => corridor.locator("animateMotion").count()).toBe(idleCount);
  await glyphs.first().evaluate(element => {
    const svg = (element as SVGGraphicsElement).ownerSVGElement!;
    svg.setCurrentTime(137.001);
  });
  expectSameGlyphFrames(await glyphFrames(glyphs), restingFrames);
  // Check movement through a full loop, including the endpoint wrap.
  const duration = await corridor.locator("animateMotion").first().getAttribute("dur");
  for (const elapsed of [1, Number.parseFloat(duration!) * 1.1]) {
    await glyphs.first().evaluate((element, time) => (element as SVGGraphicsElement).ownerSVGElement!.setCurrentTime(time), 137 + elapsed);
    const movingFrames = await glyphFrames(glyphs);
    movingFrames.forEach((frame, index) => {
      expect(Math.hypot(frame[4] - restingFrames[index][4], frame[5] - restingFrames[index][5])).toBeGreaterThan(1);
      expect(Math.hypot(frame[4], frame[5])).toBeGreaterThan(1000);
    });
  }
  await glyphs.first().evaluate(element => (element as SVGGraphicsElement).ownerSVGElement!.unpauseAnimations());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".ttc-map-stage animateMotion")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => corridor.locator("animateMotion").count()).toBe(idleCount);
});

test("directional planned calendars retain their glyph density and start at rest", async ({ page }) => {
  await page.route("**/api/dashboard?network=ttc", async route => {
    const response = await route.fetch();
    const dashboard = await response.json();
    dashboard.plannedClosures = dashboard.plannedClosures.map((closure: { id: string }) =>
      closure.id === "stub-upcoming-closure-line-1" ? { ...closure, travelDirection: "reverse" } : closure);
    await route.fulfill({ response, json: dashboard });
  });
  await page.goto("/");
  const corridor = page.locator('[data-map-impact-id="stub-upcoming-closure-line-1"]');
  const glyphs = corridor.locator(".planned-closure-moving-glyph > g");
  await expect(glyphs.first()).toBeAttached();
  const count = await glyphs.count();
  expect(count).toBeGreaterThan(8);
  await glyphs.first().evaluate(element => {
    const svg = (element as SVGGraphicsElement).ownerSVGElement!;
    svg.pauseAnimations();
    svg.setCurrentTime(137);
  });
  const resting = await glyphFrames(glyphs);
  await page.getByRole("button", { name: "Stub API upcoming weekend closure: Stub Station to Stub Terminal" }).press("Enter");
  await expect(corridor.locator("animateMotion")).toHaveCount(count);
  await glyphs.first().evaluate(element => (element as SVGGraphicsElement).ownerSVGElement!.setCurrentTime(137.001));
  expectSameGlyphFrames(await glyphFrames(glyphs), resting);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(corridor.locator("animateMotion")).toHaveCount(0);
  await expect(glyphs).toHaveCount(count);
  expectSameGlyphFrames(await glyphFrames(glyphs), resting);
});

test("incident borders draw once at idle, animate on focus, and honor app Reduced Motion", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop incident border interaction");
  await page.goto("/");
  const border = page.locator(".electric-border:visible").first();
  await expect(border).toBeVisible();
  await expect.poll(() => borderDraws(page)).toBeGreaterThan(0);
  const idle = await borderDraws(page);
  // Deliberate sampling interval: detect continuous idle drawing.
  await page.waitForTimeout(250);
  expect(await borderDraws(page)).toBe(idle);
  await border.locator("button").first().focus();
  await expect.poll(() => borderDraws(page)).toBeGreaterThan(idle);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("switch", { name: "Toggle reduced motion", exact: true }).click();
  await expect(page.locator(".linewatch-shell")).toHaveClass(/motion-paused/);
  await page.getByRole("button", { name: /^Status, / }).click();
  await expect(border).toBeVisible();
  const stopped = await borderDraws(page);
  await border.locator("button").first().focus();
  await page.waitForTimeout(250);
  expect(await borderDraws(page)).toBe(stopped);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("switch", { name: "Toggle reduced motion", exact: true }).click();
  await page.getByRole("button", { name: /^Status, / }).click();
  await border.locator("button").first().focus();
  await expect.poll(() => borderDraws(page)).toBeGreaterThan(stopped);
  // OS changes still stop borders when the app explicitly allows motion.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(border.locator(".eb-canvas-container")).toBeHidden();
  const osStopped = await borderDraws(page);
  await page.waitForTimeout(250);
  expect(await borderDraws(page)).toBe(osStopped);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => borderDraws(page)).toBeGreaterThan(osStopped);
  const focusedDraws = await borderDraws(page);
  await page.waitForTimeout(250);
  expect(await borderDraws(page) - focusedDraws).toBeLessThanOrEqual(7);
  await border.evaluate(element => { element.style.transform = "translateX(-10000px)"; });
  await expect.poll(async () => {
    const before = await borderDraws(page);
    await page.waitForTimeout(150);
    return await borderDraws(page) === before;
  }).toBe(true);
  const offscreenDraws = await borderDraws(page);
  await border.evaluate(element => { element.style.transform = ""; });
  await expect.poll(() => borderDraws(page)).toBeGreaterThan(offscreenDraws);
});

test("canvas motion is paced and stops during sheet gestures and page suspension", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.locator(".ttc-map-stage")).toHaveAttribute("data-raster-map-ready", "true");
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
  const hiddenBorders = await borderDraws(page);
  await page.waitForTimeout(250);
  expect((await frames()).length).toBe(hiddenFrames);
  expect(await borderDraws(page)).toBe(hiddenBorders);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await expect.poll(async () => (await frames()).length).toBeGreaterThan(hiddenFrames);
});
