import assert from "node:assert/strict";
import { it } from "node:test";
import { regionalOverlapChooserLayout, regionalOverlapMarkerRestingRect } from "../src/app/regional-map-overlays.ts";
import { overlapChooserSize } from "../src/components/map-chooser-layout.ts";

it("regional chooser narrows to clear side controls in a compact phone viewport", () => {
  const viewportSize = { width: 360, height: 600 };
  const uiKeepoutBoxes = [
    { x: 0, y: 0, width: 360, height: 120 },
    { x: 0, y: 500, width: 360, height: 100 },
    { x: 0, y: 120, width: 52, height: 380 },
    { x: 308, y: 120, width: 52, height: 380 },
  ];
  const { layout, size } = regionalOverlapChooserLayout({
    markerCenter: { x: 180, y: 280 }, markerSize: { width: 30, height: 30 },
    chooserSize: overlapChooserSize(3, viewportSize.width),
    viewportSize, alertCollisionBoxes: [], uiKeepoutBoxes,
  });
  assert.ok(size.width < overlapChooserSize(3, viewportSize.width).width);
  assert.ok(uiKeepoutBoxes.every(box => !(layout.left < box.x + box.width
    && layout.left + size.width > box.x && layout.top < box.y + box.height && layout.top + size.height > box.y)));
});

it("regional chooser places from the marker's resting box, not its shrinking open state", () => {
  // The positioned parent maps marker space to the screen at 2x plus an offset.
  // The marker's own CSS open scale appears only in its live client rect.
  const marker = {
    parentElement: { getScreenCTM: () => ({ a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 }) },
    getBBox: () => ({ x: -10, y: -5, width: 20, height: 10 }),
    getBoundingClientRect: () => { throw new Error("live rect includes the open transition"); },
  };
  assert.deepEqual(regionalOverlapMarkerRestingRect(marker),
    { left: 80, top: 40, right: 120, bottom: 60, width: 40, height: 20 });
});
