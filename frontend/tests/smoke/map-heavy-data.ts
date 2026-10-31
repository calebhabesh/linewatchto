import { expect, type Page } from "@playwright/test";
import type { DashboardApiResponse, NetworkId } from "../../src/app/dashboard-contract";

/**
 * Heavy, live-like map data for the GPU checks. The expensive case is a
 * chooser whose alerts span long corridors, as at Union: put the fixture's two
 * overlapping GO/UP delays on every corridor, so every line carries alert
 * tubes, glyph lanes and badges, and the chooser's outline covers the network.
 */
export async function spreadRegionalOverlapAcrossNetwork(page: Page) {
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

/** Opens the alert chooser of an overlap badge. */
export async function openOverlapChooser(page: Page, network: NetworkId) {
  const marker = network === "ttc"
    ? page.locator('[data-overlap-segment-id="stub-line-1-segment"]')
    : page.getByRole("button", { name: /^Overlapping alerts:/ }).first();
  await marker.dispatchEvent("click");
  await expect(page.locator("[data-overlap-chooser]")).toBeVisible();
}

/** A point over open map, clear of controls and the chooser. */
export async function mapPointAwayFromControls(page: Page, network: NetworkId) {
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
