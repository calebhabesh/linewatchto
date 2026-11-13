import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { installRippleScenario, RIPPLE_SCENARIOS } from "./glyph-ripple-scenarios";
import { installDismissedTransientUi, setStubMode } from "./test-support";

/**
 * Gallery for the glyph ripple: records a short clip of every
 * overlay variant (glyph-ripple-scenarios.ts) on both System Maps, zoomed in
 * on its first lane, in the eased ripple mode. Clips land in
 * LINEWATCH_RIPPLE_GALLERY_DIR (default test-results/glyph-ripple-gallery)
 * as <network>-<scenario>.webm with the lane's box in a .json beside it.
 *
 *   npx playwright test glyph-ripple-gallery.spec.ts --project=desktop-chrome --workers=1
 */

const VIEWPORT = { width: 1440, height: 900 };
const OUT = process.env.LINEWATCH_RIPPLE_GALLERY_DIR ?? join("test-results", "glyph-ripple-gallery");
const MODE = process.env.LINEWATCH_RIPPLE_MODE ?? "ripple";

for (const network of ["ttc", "regional"] as const) {
  for (const scenario of RIPPLE_SCENARIOS) {
    test(`${network} ${scenario} ripple clip`, async ({ browser, request, baseURL }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-chrome", "Recorded on desktop Chrome only.");
      test.setTimeout(90_000);
      mkdirSync(OUT, { recursive: true });
      await setStubMode(request, "regional-live");
      const context = await browser.newContext({ baseURL, viewport: VIEWPORT, recordVideo: { dir: OUT, size: VIEWPORT } });
      const page = await context.newPage();
      await installDismissedTransientUi(page);
      await installRippleScenario(page, network, scenario);
      await page.addInitScript((network) => {
        localStorage.setItem("linewatch-default-network-v1", network);
        localStorage.setItem("linewatch-map-view-v1", "diagram");
      }, network);
      await page.goto(`/?glyphMotion=${MODE}`);
      await expect(page.locator(`[data-system-map=${network}] .map-stage`)).toHaveAttribute("data-raster-map-ready", "true");
      const lanes = page.locator(`[data-system-map=${network}] .overlay-segment-group :is([data-glyph-lane], .planned-closure-icon-lane, .suspension-no-entry-lane)`);
      await expect.poll(() => lanes.count()).toBeGreaterThan(0);
      await page.waitForTimeout(800);
      // Zoom in on the longest lane in view.
      const target = await lanes.evaluateAll((elements) => elements
        .map((element) => element.getBoundingClientRect())
        .filter((box) => box.width + box.height > 0 && box.x > 380 && box.right < innerWidth - 60 && box.y > 120 && box.bottom < innerHeight - 120)
        .sort((a, b) => (b.width + b.height) - (a.width + a.height))
        .map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }))[0]);
      if (target) {
        await page.mouse.move(target.x, target.y);
        for (let tick = 0; tick < (network === "ttc" ? 14 : 12); tick += 1) {
          await page.mouse.wheel(0, -120);
          await page.waitForTimeout(80);
        }
        await page.mouse.move(VIEWPORT.width - 4, VIEWPORT.height / 2);
      }
      await page.waitForTimeout(900);
      // Crop around the drawn arrow nearest the zoom point after the zoom.
      const from = target ?? { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
      const cropCenter = await page.locator(`[data-system-map=${network}] .overlay-segment-group :is([data-glyph-lane] > g, .planned-closure-lane-glyph, .suspension-no-entry-lane > g)`)
        .evaluateAll((elements, from) => elements
          .map((element) => element.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.right > 400 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight)
          .map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }))
          .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0], from);
      const startedAt = Date.now();
      await page.waitForTimeout(4_000);
      const video = page.video();
      await context.close();
      if (video) {
        const name = `${network}-${scenario}`;
        renameSync(await video.path(), join(OUT, `${name}.webm`));
        // The clip's last 4 s are the settled ripple; the crop centres on the zoom point.
        const center = cropCenter ?? from;
        const { writeFileSync } = await import("node:fs");
        writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ center, settledSeconds: 4, recordedMs: Date.now() - startedAt }));
      }
    });
  }
}
