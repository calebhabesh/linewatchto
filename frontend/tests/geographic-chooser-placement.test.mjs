import assert from "node:assert/strict";
import { it } from "node:test";
import { chooseGeographicChooserLayout } from "../src/components/geographic-chooser-placement.ts";
import { overlapChooserSize } from "../src/components/map-chooser-layout.ts";

const intersects = (layout, size, box) => layout.left < box.right
  && layout.left + size.width > box.left
  && layout.top < box.bottom
  && layout.top + size.height > box.top;

it("geographic chooser narrows between phone side controls instead of covering them", () => {
  const viewportSize = { width: 375, height: 548 };
  const keepouts = [
    { left: 0, top: 0, right: 375, bottom: 110 },
    { left: 0, top: 296, right: 375, bottom: 548 },
    { left: 0, top: 110, right: 62, bottom: 296 },
    { left: 314, top: 110, right: 375, bottom: 296 },
  ];
  const requestedSize = overlapChooserSize(2, viewportSize.width);
  const { chooserSize, layout } = chooseGeographicChooserLayout({
    anchor: { x: 190, y: 200 }, viewportSize, requestedSize, keepouts,
  });
  assert.ok(chooserSize.width < requestedSize.width);
  assert.ok(keepouts.every((box) => !intersects(layout, chooserSize, box)));
});

it("geographic chooser covers the least UI when no clean placement exists", () => {
  const viewportSize = { width: 375, height: 400 };
  const keepouts = [
    { left: 0, top: 0, right: 375, bottom: 150 },
    { left: 0, top: 250, right: 375, bottom: 400 },
  ];
  const { chooserSize, layout } = chooseGeographicChooserLayout({
    anchor: { x: 190, y: 200 }, viewportSize, requestedSize: overlapChooserSize(4, 375), keepouts,
  });
  const coveredRows = keepouts.reduce((sum, box) => sum + Math.max(0,
    Math.min(layout.top + chooserSize.height, box.bottom) - Math.max(layout.top, box.top)), 0);
  // The 100px gap cannot hold the 142px minimum chooser; only the excess may overlap.
  assert.equal(coveredRows, chooserSize.height - 100);
});
