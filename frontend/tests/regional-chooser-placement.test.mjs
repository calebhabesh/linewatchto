import assert from "node:assert/strict";
import { it } from "node:test";
import { regionalOverlapChooserLayout } from "../src/app/regional-map-overlays.ts";
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
    alertAnchor: { x: 180, y: 240 }, chooserSize: overlapChooserSize(3, viewportSize.width),
    viewportSize, alertCollisionBoxes: [], uiKeepoutBoxes,
  });
  assert.ok(size.width < overlapChooserSize(3, viewportSize.width).width);
  assert.ok(uiKeepoutBoxes.every(box => !(layout.left < box.x + box.width
    && layout.left + size.width > box.x && layout.top < box.y + box.height && layout.top + size.height > box.y)));
});
