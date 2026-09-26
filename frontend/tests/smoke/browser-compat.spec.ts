import { expect, test } from "@playwright/test";
import { installDismissedTransientUi, setStubMode } from "./test-support";

test.beforeEach(async ({ page }) => {
  await installDismissedTransientUi(page);
});

test("keeps TTC dynamic geometry in authored viewBox coordinates", async ({ page, request }) => {
  // Fixture fallback includes real station ids, allowing the authored label
  // and its generated hit polygon to be compared directly.
  await setStubMode(request, "unavailable");
  await page.goto("/");

  const stage = page.locator(".ttc-map-stage");
  await expect(stage).toHaveAttribute("data-map-label-font-ready", "true", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-raster-map-ready", "true", { timeout: 15_000 });

  const labelAlignment = await stage.evaluate((element) => {
    const authoredLabel = element.querySelector<SVGGraphicsElement>(
      '[data-station-label-for="eglinton"]',
    );
    const hitTarget = element.querySelector<SVGPolygonElement>(
      '[data-station-label-id="eglinton"]',
    );
    if (!authoredLabel || !hitTarget) return null;

    const bounds = authoredLabel.getBBox();
    const points = (hitTarget.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number))
      .filter((pair) => pair.length === 2 && pair.every(Number.isFinite));
    if (points.length !== 4) return null;

    return {
      authored: { x: bounds.x, y: bounds.y, height: bounds.height },
      target: {
        x: Math.min(...points.map(([x]) => x)),
        y: Math.min(...points.map(([, y]) => y)),
        height: Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)),
      },
    };
  });

  expect(labelAlignment).not.toBeNull();
  expect(labelAlignment!.target.x).toBeCloseTo(labelAlignment!.authored.x, 0);
  expect(labelAlignment!.target.y).toBeCloseTo(labelAlignment!.authored.y - 8, 0);
  expect(labelAlignment!.target.height).toBeCloseTo(labelAlignment!.authored.height + 16, 0);

  await setStubMode(request, "seeded");
  await page.reload();
  await expect(stage).toHaveAttribute("data-map-label-font-ready", "true", { timeout: 15_000 });
  await expect(stage).toHaveAttribute("data-raster-map-ready", "true", { timeout: 15_000 });

  const overlapBadge = stage.locator('[data-overlap-segment-id="stub-line-1-segment"]');
  await expect(overlapBadge).toBeAttached();
  const badgePosition = await overlapBadge.evaluate((element) => {
    const match = (element.getAttribute("transform") ?? "")
      .match(/^translate\(([-\d.]+) ([-\d.]+)\)/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  });
  expect(badgePosition).not.toBeNull();
  expect(badgePosition!.x).toBeGreaterThan(3_500);
  expect(badgePosition!.x).toBeLessThan(5_600);
  expect(badgePosition!.y).toBeGreaterThan(700);
  expect(badgePosition!.y).toBeLessThan(2_200);

  // This overlay is resolved from an authored non-linear guide path. Firefox
  // used to apply the SVG's 4500/8250 presentation scale to it a second time,
  // collapsing the path toward the upper-left corner of the viewBox.
  const guideBackedPath = stage.locator(
    '[data-map-impact-id="reduced-speed-zone-stub-union-curve"] .asset-alert-path',
  ).first();
  await expect(guideBackedPath).toBeAttached();
  const pathNumbers = (await guideBackedPath.getAttribute("d"))
    ?.match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number) ?? [];
  const xCoordinates = pathNumbers.filter((_value, index) => index % 2 === 0);
  const yCoordinates = pathNumbers.filter((_value, index) => index % 2 === 1);
  expect(Math.max(...xCoordinates)).toBeGreaterThan(4_300);
  expect(Math.max(...yCoordinates)).toBeGreaterThan(3_500);
});

test("prepares regional map SVG with dynamic layers, planned station layer, and hit targets", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");

  await page.getByRole("button", { name: "GO/UP", exact: true }).first().click();
  const regionalMap = page.getByRole("region", { name: "Interactive GO and UP map" });
  await expect(regionalMap).toBeVisible();

  const layerInventory = await page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="GO and UP regional rail schematic"]');
    if (!svg) return null;

    const plannedStationLayer = svg.querySelector("#regional-dynamic-planned-station-layer");
    const segmentLayer = svg.querySelector("#regional-dynamic-segment-layer");
    const selectedSegmentLayer = svg.querySelector("#regional-dynamic-selected-segment-layer");
    const stationRingLayer = svg.querySelector("#regional-dynamic-station-ring-layer");
    const hoverLayer = svg.querySelector("#regional-dynamic-hover-layer");
    const effectsLayer = svg.querySelector("#regional-dynamic-effects-layer");
    const selectionSources = svg.querySelector("defs#regional-station-selection-sources");
    const labelCutoutSources = svg.querySelector("defs#regional-station-label-cutout-sources");

    const unionHitTarget = svg.querySelector('.regional-station-hit-target[data-regional-station-id="union"]');
    const unionLabelHitTarget = svg.querySelector('.regional-station-label-hit-target[data-regional-station-id="union"]');
    const bloorJunctionSource = svg.querySelector("#regional-station-selection-source-bloor");

    return {
      hasPlannedStationLayer: Boolean(plannedStationLayer),
      hasSegmentLayer: Boolean(segmentLayer),
      hasSelectedSegmentLayer: Boolean(selectedSegmentLayer),
      hasStationRingLayer: Boolean(stationRingLayer),
      hasHoverLayer: Boolean(hoverLayer),
      hasEffectsLayer: Boolean(effectsLayer),
      hasSelectionSources: Boolean(selectionSources),
      hasLabelCutoutSources: Boolean(labelCutoutSources),
      hasUnionHitTarget: Boolean(unionHitTarget),
      hasUnionLabelHitTarget: Boolean(unionLabelHitTarget),
      hasBloorJunctionSource: Boolean(bloorJunctionSource),
    };
  });

  expect(layerInventory).not.toBeNull();
  expect(layerInventory!.hasPlannedStationLayer).toBe(true);
  expect(layerInventory!.hasSegmentLayer).toBe(true);
  expect(layerInventory!.hasSelectedSegmentLayer).toBe(true);
  expect(layerInventory!.hasStationRingLayer).toBe(true);
  expect(layerInventory!.hasHoverLayer).toBe(true);
  expect(layerInventory!.hasEffectsLayer).toBe(true);
  expect(layerInventory!.hasSelectionSources).toBe(true);
  expect(layerInventory!.hasLabelCutoutSources).toBe(true);
  expect(layerInventory!.hasUnionHitTarget).toBe(true);
  expect(layerInventory!.hasUnionLabelHitTarget).toBe(true);
  expect(layerInventory!.hasBloorJunctionSource).toBe(true);
});
