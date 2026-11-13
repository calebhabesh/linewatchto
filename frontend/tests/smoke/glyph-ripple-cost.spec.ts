import { expect, test, type Page } from "@playwright/test";
import { installRippleScenario, RIPPLE_SCENARIOS, RIPPLING_SCENARIOS } from "./glyph-ripple-scenarios";
import { mapPointAwayFromControls } from "./map-heavy-data";
import { MEASURED_PROJECT, registerRealChrome } from "./real-chrome";
import { installDismissedTransientUi, setStubMode } from "./test-support";

/**
 * Measurement for the glyph ripple (glyph-motion.ts).
 * For each overlay variant (glyph-ripple-scenarios.ts: every segment carries
 * one alert of that kind and direction) and each mode, it records at rest
 * the style, paint and raster work over a fixed window, whether arrows
 * change at rest and under a held zoom flag, and Chrome's tile-memory
 * warnings during a wheel-zoom burst. Variants that should stay still must
 * not change in any mode. Real Chrome on the machine's GPU, like
 * test:map-zoom-memory; not part of CI.
 *
 *   npx playwright test glyph-ripple-cost.spec.ts --project=desktop-chrome --workers=1
 */

const VIEWPORT = { width: 2560, height: 1309 };
const IDLE_MS = 4_000;
const MODES = ["off", "ripple-stepped", "ripple"] as const;

const chrome = registerRealChrome({
  window: { width: VIEWPORT.width, height: VIEWPORT.height + 120 },
  debuggingPort: 9341,
});

type TraceEvent = { name: string; ph: string; dur?: number };

async function idleWork(page: Page) {
  // Most composited layers seen while idle: an animated SVG child that
  // Chromium promotes would multiply this.
  const cdp = await page.context().newCDPSession(page);
  let maxLayers = 0;
  cdp.on("LayerTree.layerTreeDidChange", (event) => {
    maxLayers = Math.max(maxLayers, event.layers?.length ?? 0);
  });
  await cdp.send("LayerTree.enable");
  const browser = chrome.browser();
  await browser.startTracing(page, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc"] });
  await page.waitForTimeout(IDLE_MS);
  const buffer = await browser.stopTracing();
  const events = (JSON.parse(buffer.toString()).traceEvents ?? []) as TraceEvent[];
  const ms = (name: string) => Math.round(events
    .filter((event) => event.name === name && event.ph === "X")
    .reduce((sum, event) => sum + (event.dur ?? 0), 0) / 100) / 10;
  await cdp.send("LayerTree.disable");
  await cdp.detach();
  return { styleMs: ms("UpdateLayoutTree"), paintMs: ms("Paint"), rasterMs: ms("RasterTask"), maxLayers };
}

async function zoomBurstWarnings(page: Page, network: "ttc" | "regional") {
  const point = await mapPointAwayFromControls(page, network);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(300);
  const before = chrome.tileWarnings();
  for (let round = 0; round < 4; round += 1) {
    for (let tick = 0; tick < 12; tick += 1) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
    for (let tick = 0; tick < 12; tick += 1) await page.mouse.wheel(0, 120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  return chrome.tileWarnings() - before;
}

/** Does any drawn arrow's opacity change over three steps, at rest and with a zoom flag held? */
async function arrowMotion(page: Page, network: "ttc" | "regional") {
  return page.evaluate(async (network) => {
    const map = document.querySelector(`[data-system-map=${network}]`);
    const sample = () => [...(map?.querySelectorAll(".map-direction-chevron") ?? [])]
      .map((arrow) => getComputedStyle(arrow).strokeOpacity).join();
    const changes = async () => {
      const before = sample();
      await new Promise((resolve) => setTimeout(resolve, 900));
      return sample() !== before;
    };
    const atRest = await changes();
    map?.setAttribute("data-map-zoom-active", "true");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const duringZoom = await changes();
    map?.removeAttribute("data-map-zoom-active");
    return { atRest, duringZoom, eased: document.documentElement.dataset.glyphRippleEased ?? null };
  }, network);
}

for (const network of ["ttc", "regional"] as const) {
  for (const scenario of RIPPLE_SCENARIOS) {
    test(`${network} ${scenario} glyph ripple cost`, async ({ request, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== MEASURED_PROJECT, `Measured in ${MEASURED_PROJECT} only.`);
      test.setTimeout(180_000);
      await setStubMode(request, "regional-live");
      const results: Record<string, unknown> = {};
      for (const mode of MODES) {
        const context = await chrome.browser().newContext({ baseURL, viewport: VIEWPORT });
        const page = await context.newPage();
        await installDismissedTransientUi(page);
        await installRippleScenario(page, network, scenario);
        await page.addInitScript((network) => {
          localStorage.setItem("linewatch-default-network-v1", network);
          localStorage.setItem("linewatch-map-view-v1", "diagram");
        }, network);
        await page.goto(`/?glyphMotion=${mode}`);
        await expect(page.locator(`[data-system-map=${network}] .map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
        const glyphs = page.locator(`[data-system-map=${network}] .overlay-segment-group [data-glyph-lane] > g, [data-system-map=${network}] .planned-closure-lane-glyph`);
        await expect.poll(() => glyphs.count(), { message: `${scenario} draws glyphs` }).toBeGreaterThan(4);
        await page.waitForTimeout(1_500);
        const arrows = await page.locator(`[data-system-map=${network}] [data-glyph-ripple] [data-ripple-phase] .map-direction-chevron`).count();
        const idle = await idleWork(page);
        const motion = await arrowMotion(page, network);
        const zoomWarnings = await zoomBurstWarnings(page, network);
        results[mode] = { arrows, ...idle, ...motion, zoomWarnings };
        await context.close();

        // Desktop map animations keep running while the camera moves.
        expect(motion.duringZoom, `${scenario} ${mode} motion during zoom`).toBe(motion.atRest);
        expect(motion.atRest, `${scenario} ${mode} motion at rest`).toBe(mode !== "off" && RIPPLING_SCENARIOS.has(scenario));
      }
      console.log(`RESULT ${network} ${scenario} ${JSON.stringify(results)}`);
      test.info().annotations.push({ type: "glyph-ripple-cost", description: JSON.stringify(results) });
    });
  }
}
