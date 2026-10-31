import { expect, test, type CDPSession, type Page } from "@playwright/test";
import type { NetworkId } from "../../src/app/dashboard-contract";
import { mapPointAwayFromControls, spreadRegionalOverlapAcrossNetwork } from "./map-heavy-data";
import { MEASURED_PROJECT, registerRealChrome } from "./real-chrome";
import { installDismissedTransientUi, setStubMode } from "./test-support";

/**
 * Plan 09's System Map budgets, as a command: every map, on a desktop GPU at
 * 2560 × 1309, with heavy live-like data, per gesture burst (a mouse-wheel
 * burst, a two-second drag released while moving, and a hover sweep across
 * every alert), plus a phone pass at 4× CPU throttling.
 *
 *   npm --prefix frontend run test:map-budgets
 *
 * Needs real Chrome on a GPU and display, so it is not part of CI or the
 * release gate. Set LINEWATCH_MAP_BUDGET_URL=http://localhost:3000 to measure
 * the live dev server instead of the heavy stub data. Each run prints its
 * numbers; docs/refactor-plan/09-system-map-engine.md records them.
 */

const VIEWPORT = { width: 2560, height: 1309 };
const LIVE_URL = process.env.LINEWATCH_MAP_BUDGET_URL;

const BUDGET = {
  tileWarnings: 0,
  /**
   * Frame p95 within two frames at the display's rate, or at 60 Hz on a
   * faster display (so a 165 Hz monitor does not halve the budget), plus a
   * millisecond of timer noise.
   */
  frameP95Frames: 2,
  framesOver20Ms: 10,
  longAnimationFrames: 5,
  longAnimationFrameMaxMs: 120,
  /** Drawing-layer area at rest: 1.5 × viewport area × the plane count TTC used (about 100 Mpx here). */
  layerAreaMpx: 100,
  /** One camera commit per gesture: the camera's zoom or gesture flag ends once. */
  commitsPerGesture: 1,
};

/**
 * Phones (Pixel-class viewport, 4× CPU throttling on a desktop, not a real
 * device), recorded 2026-10-31. Provisional regression guards until plan 09's
 * low-end Android measurement sets the real budgets.
 */
const PHONE_BUDGET = {
  /**
   * Interaction to next paint on a station tap, median of three. Measured
   * TTC 216–240 ms, GO/UP 568–624 ms; most of GO/UP's is rendering its
   * station details panel, not the map. The goal is 200 ms (INP "good").
   */
  tapInpMs: 800,
  /** The longest task while a live refresh replaces the overlays. */
  refreshLongestTaskMs: 250,
  /** Drawing layers during a pinch. */
  pinchLayers: 40,
};

const chrome = registerRealChrome({
  window: { width: VIEWPORT.width, height: VIEWPORT.height + 120 },
  debuggingPort: 9341,
});

/** In-page recorder: frame intervals, long animation frames, event timing and camera commits. */
function installRecorder() {
  type Recording = { frames: number[]; loafs: number[]; events: { name: string; duration: number }[]; commits: number };
  let recording = false;
  let last = 0;
  let moving = false;
  let data: Recording = { frames: [], loafs: [], events: [], commits: 0 };
  // The camera commits once when its zoom or gesture flag clears.
  const cameraMoving = () => Boolean(document.querySelector('[data-map-zoom-active="true"], [data-map-gesture-active="true"]'));
  const loop = (time: number) => {
    if (!recording) return;
    if (last) data.frames.push(time - last);
    last = time;
    const now = cameraMoving();
    if (moving && !now) data.commits += 1;
    moving = now;
    requestAnimationFrame(loop);
  };
  try {
    new PerformanceObserver((list) => {
      if (recording) for (const entry of list.getEntries()) data.loafs.push(entry.duration);
    }).observe({ type: "long-animation-frame" });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((list) => {
      if (recording) for (const entry of list.getEntries()) data.events.push({ name: entry.name, duration: entry.duration });
    }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
  } catch { /* unsupported */ }
  (window as unknown as { __mapBudget: unknown }).__mapBudget = {
    start() {
      data = { frames: [], loafs: [], events: [], commits: 0 };
      last = 0;
      moving = cameraMoving();
      recording = true;
      requestAnimationFrame(loop);
    },
    stop(): Recording {
      recording = false;
      return data;
    },
  };
}

type Recording = { frames: number[]; loafs: number[]; events: { name: string; duration: number }[]; commits: number };
const start = (page: Page) => page.evaluate(() => (window as unknown as { __mapBudget: { start(): void } }).__mapBudget.start());
const stop = (page: Page) => page.evaluate(() => (window as unknown as { __mapBudget: { stop(): Recording } }).__mapBudget.stop());

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/** The display's frame interval: the median rAF interval over a still second. */
async function displayFrameMs(page: Page) {
  await start(page);
  await page.waitForTimeout(1000);
  return percentile((await stop(page)).frames, 0.5);
}

/** Waits until the camera has settled: no zoom, gesture or flight under way. */
async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => !document.querySelector(
    '[data-map-zoom-active="true"], [data-map-gesture-active="true"], [data-map-camera-moving="true"]',
  )), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(300);
}

/** Drawing layers and their total area in megapixels, from Chrome's layer tree. */
async function drawingLayers(cdp: CDPSession) {
  const tree = new Promise<{ layers?: { drawsContent: boolean; width: number; height: number }[] }>((resolve) => {
    cdp.once("LayerTree.layerTreeDidChange", resolve);
  });
  await cdp.send("LayerTree.enable");
  const { layers = [] } = await Promise.race([tree, new Promise<{ layers?: [] }>((resolve) => setTimeout(() => resolve({}), 3000))]);
  await cdp.send("LayerTree.disable");
  const drawing = layers.filter((layer) => layer.drawsContent);
  return {
    count: drawing.length,
    areaMpx: Math.round(drawing.reduce((sum, layer) => sum + layer.width * layer.height, 0) / 1e5) / 10,
  };
}

type BurstResult = { gesture: string; p95: number; over20: number; loafs: number; loafMax: number; commits: number; tileWarnings: number };

async function measure(page: Page, gesture: string, frameMs: number, run: () => Promise<void>): Promise<BurstResult> {
  const before = chrome.tileWarnings();
  await start(page);
  await run();
  await settled(page);
  const recording = await stop(page);
  const result = {
    gesture,
    p95: Math.round(percentile(recording.frames, 0.95) * 10) / 10,
    over20: recording.frames.filter((frame) => frame > 20).length,
    loafs: recording.loafs.filter((duration) => duration > 50).length,
    loafMax: Math.round(Math.max(0, ...recording.loafs)),
    commits: recording.commits,
    tileWarnings: chrome.tileWarnings() - before,
  };
  console.log(`  ${gesture}: p95 ${result.p95} ms (display ${frameMs.toFixed(1)}), ${result.over20} frames > 20 ms, `
    + `${result.loafs} long animation frames (max ${result.loafMax} ms), ${result.commits} commit(s), ${result.tileWarnings} tile warnings`);
  return result;
}

async function openMap(network: NetworkId, baseURL: string | undefined, request: Parameters<typeof setStubMode>[0], mobile = false) {
  if (!LIVE_URL) await setStubMode(request, "regional-live");
  const context = await chrome.browser().newContext({
    baseURL: LIVE_URL ?? baseURL,
    viewport: mobile ? { width: 412, height: 915 } : VIEWPORT,
    deviceScaleFactor: mobile ? 2.625 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  await installDismissedTransientUi(page);
  await page.addInitScript(installRecorder);
  if (!LIVE_URL && network === "regional") await spreadRegionalOverlapAcrossNetwork(page);
  await page.addInitScript((network) => {
    localStorage.setItem("linewatch-default-network-v1", network);
    localStorage.setItem("linewatch-map-view-v1", "diagram");
    document.cookie = `linewatch-visual-preferences-v1=${encodeURIComponent(JSON.stringify({ defaultNetwork: network, theme: "dark" }))}; path=/`;
  }, network);
  await page.goto("/");
  await expect(page.locator(`[data-network-map-layer=${network}][data-map-ready=true]`)).toBeAttached({ timeout: 60_000 });
  await expect(page.locator(`.${network}-map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
  await page.waitForTimeout(1500);
  return { context, page };
}

for (const network of ["ttc", "regional"] as const) {
  test(`${network} System Map meets the desktop budgets`, async ({ request, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== MEASURED_PROJECT, `Measured in ${MEASURED_PROJECT} only.`);
    test.setTimeout(180_000);
    const { context, page } = await openMap(network, baseURL, request);
    const cdp = await context.newCDPSession(page);
    const frameMs = await displayFrameMs(page);
    console.log(`${network} (${LIVE_URL ? `live ${LIVE_URL}` : "heavy stub"}):`);

    const rest = await drawingLayers(cdp);
    console.log(`  at rest: ${rest.count} drawing layers, ${rest.areaMpx} Mpx`);

    const point = await mapPointAwayFromControls(page, network);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(300);

    // One continuous burst: 4 × 6 notches of 100 pixels, 60 ms apart, in then out.
    const wheel = await measure(page, "wheel burst", frameMs, async () => {
      for (let notch = 0; notch < 24; notch += 1) {
        await page.mouse.wheel(0, Math.floor(notch / 6) % 2 === 0 ? -100 : 100);
        await page.waitForTimeout(60);
      }
    });

    // A two-second drag, released while moving so it glides.
    const drag = await measure(page, "drag and release", frameMs, async () => {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      for (let step = 1; step <= 120; step += 1) {
        await page.mouse.move(point.x + Math.sin(step / 19) * 220, point.y + step * 1.5);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
    });

    // Hover across every line and station alert on screen.
    const targets = await page.evaluate(() => [...document.querySelectorAll("[data-map-impact-id]")]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0
        && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight)
      .map((rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }))
      .slice(0, 80));
    const hover = await measure(page, `hover sweep (${targets.length} alerts)`, frameMs, async () => {
      for (const target of targets) {
        await page.mouse.move(target.x, target.y, { steps: 4 });
        await page.waitForTimeout(30);
      }
      await page.mouse.move(point.x, point.y);
    });
    await context.close();

    for (const burst of [wheel, drag, hover]) {
      expect.soft(burst.tileWarnings, `${burst.gesture}: tile memory warnings`).toBeLessThanOrEqual(BUDGET.tileWarnings);
      expect.soft(burst.p95, `${burst.gesture}: frame p95`).toBeLessThanOrEqual(BUDGET.frameP95Frames * Math.max(frameMs, 1000 / 60) + 1);
      expect.soft(burst.loafs, `${burst.gesture}: long animation frames`).toBeLessThanOrEqual(BUDGET.longAnimationFrames);
      expect.soft(burst.loafMax, `${burst.gesture}: longest animation frame`).toBeLessThanOrEqual(BUDGET.longAnimationFrameMaxMs);
    }
    expect.soft(wheel.over20, "wheel burst: frames over 20 ms").toBeLessThanOrEqual(BUDGET.framesOver20Ms);
    expect.soft(wheel.commits, "wheel burst: camera commits").toBeLessThanOrEqual(BUDGET.commitsPerGesture);
    expect.soft(drag.commits, "drag: camera commits").toBeLessThanOrEqual(BUDGET.commitsPerGesture);
    expect.soft(rest.areaMpx, "drawing-layer area at rest").toBeLessThanOrEqual(BUDGET.layerAreaMpx);
  });

  test(`${network} System Map meets the phone budgets at 4× CPU throttling`, async ({ request, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== MEASURED_PROJECT, `Measured in ${MEASURED_PROJECT} only.`);
    test.setTimeout(180_000);
    const { context, page } = await openMap(network, baseURL, request, true);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    console.log(`${network} phone (4× CPU, ${LIVE_URL ? "live" : "heavy stub"}):`);

    // Interaction to next paint on a station tap.
    const station = await page.evaluate((network) => {
      const selector = network === "ttc" ? "[data-station-id]" : ".station-hit-target[data-station-id]";
      const viewport = document.querySelector(network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport")!.getBoundingClientRect();
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        if (x > viewport.left + 40 && x < viewport.right - 40 && y > viewport.top + 160 && y < viewport.bottom - 240
          && element.contains(document.elementFromPoint(x, y))) return { x, y };
      }
      return null;
    }, network);
    expect(station, "a tappable station on screen").not.toBeNull();
    // One tap varies by hundreds of milliseconds between runs; take the median of three.
    const taps: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await start(page);
      await page.touchscreen.tap(station!.x, station!.y);
      await page.waitForTimeout(1500);
      const tap = await stop(page);
      taps.push(Math.round(Math.max(0, ...tap.events.filter((event) => /pointer|click|touch/.test(event.name)).map((event) => event.duration))));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }
    const tapInp = [...taps].sort((a, b) => a - b)[1];
    console.log(`  station tap: INP ${tapInp} ms (median of ${taps.join(", ")})`);

    // The longest task while a live refresh replaces the overlays.
    await start(page);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(3000);
    const refresh = await stop(page);
    const refreshLongest = Math.round(Math.max(0, ...refresh.loafs));
    console.log(`  live refresh: longest animation frame ${refreshLongest} ms`);

    // Drawing layers in the middle of a pinch.
    const viewportBox = await page.evaluate((network) => {
      const box = document.querySelector(network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport")!.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }, network);
    const pinch = cdp.send("Input.synthesizePinchGesture", {
      x: viewportBox.x,
      y: viewportBox.y,
      scaleFactor: 1.6,
      relativeSpeed: 300,
      gestureSourceType: "touch",
    });
    await page.waitForTimeout(250);
    const during = await drawingLayers(cdp);
    await pinch;
    console.log(`  pinch: ${during.count} drawing layers (${during.areaMpx} Mpx)`);
    await context.close();

    expect.soft(tapInp, "station tap INP").toBeLessThanOrEqual(PHONE_BUDGET.tapInpMs);
    expect.soft(refreshLongest, "longest frame during a live refresh").toBeLessThanOrEqual(PHONE_BUDGET.refreshLongestTaskMs);
    expect.soft(during.count, "drawing layers during a pinch").toBeLessThanOrEqual(PHONE_BUDGET.pinchLayers);
  });
}
