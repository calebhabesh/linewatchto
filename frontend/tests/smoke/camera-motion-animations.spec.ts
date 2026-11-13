import { expect, test, type Page } from "@playwright/test";
import { mapPointAwayFromControls, openOverlapChooser, spreadRegionalOverlapAcrossNetwork } from "./map-heavy-data";
import { MEASURED_PROJECT, registerRealChrome } from "./real-chrome";
import { installDismissedTransientUi, setStubMode } from "./test-support";

/**
 * Desktop map animations keep running while the camera moves (base-map.css
 * holds them on phones only). The selection flash used to pause because
 * repainting a whole-line alert's drop-shadow flash on every frame of a
 * scaling flight overflowed Chrome's tile memory. This reproduces that worst
 * case (GO/UP overlapping alerts spread over every corridor, one selected so
 * its flash runs network-wide) and records, for the shipped styles
 * ("current") and with every map animation forced running ("forced"),
 * tile-memory warnings, long frames and whether the flash ran through a
 * wheel-zoom burst, a drag and camera flights. Measured clean on 2026-11-12
 * (0 warnings; flash running throughout). Real Chrome on the machine's GPU
 * at 2560 px; not in CI.
 *
 *   npx playwright test camera-motion-animations.spec.ts --project=desktop-chrome --workers=1
 */

const VIEWPORT = { width: 2560, height: 1309 };
const RUNNING_OVERRIDE = ":root:root:root .map-stage, :root:root:root .map-stage * { animation-play-state: running !important; }";

const chrome = registerRealChrome({
  window: { width: VIEWPORT.width, height: VIEWPORT.height + 120 },
  debuggingPort: 9345,
});

async function startFrames(page: Page) {
  await page.evaluate(() => {
    const probe = window as Window & { frameProbe?: { frames: number[]; stop: boolean; states: string[] } };
    const state = { frames: [] as number[], stop: false, states: [] as string[] };
    probe.frameProbe = state;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      if (state.stop) return;
      state.frames.push(now - last);
      last = now;
      if (++frame % 20 === 0) {
        const flash = document.querySelector("[data-system-map=regional] .map-selection-attention");
        const animation = flash?.getAnimations()[0];
        state.states.push(animation ? animation.playState : "none");
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrames(page: Page) {
  return page.evaluate(() => {
    const probe = (window as Window & { frameProbe?: { frames: number[]; stop: boolean; states: string[] } }).frameProbe!;
    probe.stop = true;
    const frames = probe.frames.slice(1).sort((a, b) => a - b);
    const p = (q: number) => Math.round(frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] * 10) / 10;
    const running = probe.states.filter((state) => state === "running").length;
    return { frames: frames.length, p95: p(0.95), max: p(1), over25ms: frames.filter((ms) => ms > 25).length, flashRunning: `${running}/${probe.states.length}` };
  });
}

test("map animations while the camera moves, worst case", async ({ request, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== MEASURED_PROJECT, `Measured in ${MEASURED_PROJECT} only.`);
  test.setTimeout(300_000);
  await setStubMode(request, "regional-live");
  const results: Record<string, unknown> = {};
  for (const variant of ["current", "forced"] as const) {
    const context = await chrome.browser().newContext({ baseURL, viewport: VIEWPORT });
    const page = await context.newPage();
    await installDismissedTransientUi(page);
    await spreadRegionalOverlapAcrossNetwork(page);
    await page.addInitScript(({ variant, css }) => {
      localStorage.setItem("linewatch-default-network-v1", "regional");
      localStorage.setItem("linewatch-map-view-v1", "diagram");
      if (variant === "forced") {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = css;
          document.head.append(style);
        });
      }
    }, { variant, css: RUNNING_OVERRIDE });
    await page.goto("/");
    await expect(page.locator("[data-system-map=regional] .map-stage")).toHaveAttribute("data-raster-map-ready", "true");
    await page.waitForTimeout(800);
    await openOverlapChooser(page, "regional");
    await page.locator("[data-overlap-chooser] button:not(.overlap-chooser-close)").first().click();
    await expect(page.locator("[data-system-map=regional] .map-selection-attention").first()).toBeAttached();
    await page.waitForTimeout(3_500);
    const point = await mapPointAwayFromControls(page, "regional");

    await page.mouse.move(point.x, point.y);
    await startFrames(page);
    let before = chrome.tileWarnings();
    for (let round = 0; round < 6; round += 1) {
      for (let tick = 0; tick < 12; tick += 1) await page.mouse.wheel(0, -120);
      await page.waitForTimeout(60);
      for (let tick = 0; tick < 12; tick += 1) await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    const zoom = { ...(await stopFrames(page)), tileWarnings: chrome.tileWarnings() - before };

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await startFrames(page);
    before = chrome.tileWarnings();
    for (let pass = 0; pass < 4; pass += 1) {
      for (let step = 1; step <= 45; step += 1) {
        const offset = (pass % 2 === 0 ? step : 45 - step) * 8;
        await page.mouse.move(point.x - offset, point.y - offset / 3);
        await page.waitForTimeout(16);
      }
    }
    const drag = { ...(await stopFrames(page)), tileWarnings: chrome.tileWarnings() - before };
    await page.mouse.up();
    await page.waitForTimeout(1_200);

    // Camera flights: zoom in twice and back out with the toolbar, then Center.
    await startFrames(page);
    before = chrome.tileWarnings();
    for (const name of ["Zoom in", "Zoom in", "Zoom out", "Center map view"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(900);
    }
    const flights = { ...(await stopFrames(page)), tileWarnings: chrome.tileWarnings() - before };

    results[variant] = { zoom, drag, flights };
    expect(zoom.tileWarnings + drag.tileWarnings + flights.tileWarnings, `${variant}: tile memory`).toBeLessThanOrEqual(100);
    await context.close();
  }
  console.log(`RESULT ${JSON.stringify(results)}`);
  test.info().annotations.push({ type: "camera-motion-animations", description: JSON.stringify(results) });
});
