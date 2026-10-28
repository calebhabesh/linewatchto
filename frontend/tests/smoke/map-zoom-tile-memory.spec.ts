import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import type { DashboardApiResponse, NetworkId } from "../../src/app/dashboard-contract";
import { installDismissedTransientUi, setStubMode } from "./test-support";

/**
 * Fast zooming with the alert chooser open must not overflow Chrome's GPU
 * tile memory. When it overflows, Chrome stops drawing tiles across the whole
 * page and the map, legend, and sidebar flicker.
 *
 * Needs real Chrome on a real GPU and display, so it is not part of CI or the
 * release gate. Run it after changing map layers, overlay effects, or zoom
 * handling: `npm --prefix frontend run test:map-zoom-memory`.
 * Chrome's own "tile memory limits exceeded" log lines are the signal.
 */

const VIEWPORT = { width: 2560, height: 1309 };
const ZOOM_ROUNDS = 8;
const TICKS_PER_DIRECTION = 12;
// Measured at 2560 x 1309 on 2026-10-26: about 105-135 (GO/UP) and 8 (TTC)
// with the zoom-time fixes, and about 1,800 (GO/UP) without them.
const MAX_TILE_WARNINGS = Number(process.env.LINEWATCH_MAX_TILE_WARNINGS ?? 400);

// Chrome writes tile-memory warnings only to its own stderr, which
// Playwright does not expose, so the test starts Chrome itself and attaches.
const CHROME = process.env.LINEWATCH_CHROME ?? "google-chrome-stable";
const DEBUGGING_PORT = 9339;

let chrome: ChildProcess;
let profileDirectory: string;
let browser: Browser;
const chromeLog: string[] = [];

test.skip(
  Boolean(process.env.CI) || !(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
  "Needs real Chrome on a display and GPU.",
);
// One real Chrome serves the check; other projects only skip it.
const MEASURED_PROJECT = "desktop-chrome";

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== MEASURED_PROJECT) return;
  profileDirectory = mkdtempSync(join(tmpdir(), "linewatch-tile-memory-"));
  chrome = spawn(CHROME, [
    `--user-data-dir=${profileDirectory}`,
    `--remote-debugging-port=${DEBUGGING_PORT}`,
    "--enable-logging=stderr",
    "--v=0",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${VIEWPORT.width},${VIEWPORT.height + 120}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr?.setEncoding("utf8");
  chrome.stderr?.on("data", (chunk: string) => chromeLog.push(...chunk.split("\n")));
  for (let attempt = 0; ; attempt += 1) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUGGING_PORT}`);
      break;
    } catch (error) {
      if (attempt >= 50) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
});

test.afterAll(async () => {
  await browser?.close().catch(() => undefined);
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
  }
  if (profileDirectory) rmSync(profileDirectory, { recursive: true, force: true });
});

const tileWarnings = () => chromeLog.filter((line) => line.includes("tile memory limits exceeded")).length;

/**
 * The expensive case is a chooser whose alerts span long corridors, as at
 * Union. Put the fixture's two overlapping GO/UP delays on every corridor so
 * the chooser's outline covers the whole network.
 */
async function spreadRegionalOverlapAcrossNetwork(page: Page) {
  await page.route("**/api/dashboard?network=regional*", async (route) => {
    const response = await route.fetch();
    const body: DashboardApiResponse = await response.json();
    const overlapping = body.map.segments.find((segment) => (segment.impacts?.length ?? 0) > 1)?.impacts ?? [];
    if (overlapping.length < 2) throw new Error("fixture has no overlapping GO/UP alerts");
    const ids = new Set(overlapping.map((impact) => impact.cardId));
    const segmentIds = body.map.segments.map((segment) => segment.id);
    body.delays = body.delays.map((delay) => ids.has(delay.id) ? { ...delay, affectedSegmentIds: segmentIds } : delay);
    body.map.segments = body.map.segments.map((segment) => ({ ...segment, overlay: "delay", impacts: overlapping }));
    await route.fulfill({ response, json: body });
  });
}

async function openChooser(page: Page, network: NetworkId) {
  const marker = network === "ttc"
    ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
    : page.getByRole("button", { name: /^Overlapping alerts:/ }).first();
  await marker.dispatchEvent("click");
  await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
}

async function mapPointAwayFromControls(page: Page, network: NetworkId) {
  return page.evaluate((network) => {
    const viewport = document.querySelector(network === "ttc" ? "[data-map-pan-zoom-viewport]" : ".regional-map-viewport");
    if (!viewport) throw new Error("map viewport missing");
    const box = viewport.getBoundingClientRect();
    for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      for (const fx of [0.5, 0.6, 0.7, 0.4, 0.3]) {
        const x = box.left + box.width * fx;
        const y = box.top + box.height * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && viewport.contains(hit) && !hit.closest("button, [data-overlap-chooser], .overlap-chooser-portal")) {
          return { x, y };
        }
      }
    }
    throw new Error("no open map point to zoom over");
  }, network);
}

for (const network of ["regional", "ttc"] as const) {
  test(`${network} fast zoom with the alert chooser open stays within tile memory`, async ({ request, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== MEASURED_PROJECT, `Measured in ${MEASURED_PROJECT} only.`);
    test.setTimeout(90_000);
    await setStubMode(request, "regional-live");
    const context = await browser.newContext({ baseURL, viewport: VIEWPORT });
    const page = await context.newPage();
    await installDismissedTransientUi(page);
    if (network === "regional") await spreadRegionalOverlapAcrossNetwork(page);
    await page.addInitScript((network) => {
      localStorage.setItem("linewatch-default-network-v1", network);
      localStorage.setItem("linewatch-map-view-v1", "diagram");
    }, network);
    await page.goto("/");
    await expect(page.locator(`.${network}-map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
    await page.waitForTimeout(800);
    await openChooser(page, network);
    await page.waitForTimeout(500);

    const point = await mapPointAwayFromControls(page, network);
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(300);

    const before = tileWarnings();
    for (let round = 0; round < ZOOM_ROUNDS; round += 1) {
      for (let tick = 0; tick < TICKS_PER_DIRECTION; tick += 1) await page.mouse.wheel(0, -120);
      await page.waitForTimeout(60);
      for (let tick = 0; tick < TICKS_PER_DIRECTION; tick += 1) await page.mouse.wheel(0, 120);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    const warnings = tileWarnings() - before;
    test.info().annotations.push({ type: "tile-memory-warnings", description: String(warnings) });
    console.log(`${network}: ${warnings} tile memory warnings during the zoom burst`);
    await context.close();
    expect(warnings, "Chrome tile memory overflowed while zooming").toBeLessThanOrEqual(MAX_TILE_WARNINGS);
  });
}
