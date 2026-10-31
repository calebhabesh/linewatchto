import { expect, test } from "@playwright/test";
import { mapPointAwayFromControls, openOverlapChooser, spreadRegionalOverlapAcrossNetwork } from "./map-heavy-data";
import { MEASURED_PROJECT, registerRealChrome } from "./real-chrome";
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
// Both maps log 0 here; glyph lanes no longer have corridor-length clip
// masks (about 160 on GO/UP's live data with them). 100 leaves room for
// machine variance.
const MAX_TILE_WARNINGS = Number(process.env.LINEWATCH_MAX_TILE_WARNINGS ?? 100);

const chrome = registerRealChrome({
  window: { width: VIEWPORT.width, height: VIEWPORT.height + 120 },
  debuggingPort: 9339,
});
const tileWarnings = chrome.tileWarnings;

for (const network of ["regional", "ttc"] as const) {
  test(`${network} fast zoom with the alert chooser open stays within tile memory`, async ({ request, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== MEASURED_PROJECT, `Measured in ${MEASURED_PROJECT} only.`);
    test.setTimeout(90_000);
    await setStubMode(request, "regional-live");
    const context = await chrome.browser().newContext({ baseURL, viewport: VIEWPORT });
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
    await openOverlapChooser(page, network);
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
