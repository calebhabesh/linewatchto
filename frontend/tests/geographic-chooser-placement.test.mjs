import assert from "node:assert/strict";
import { it } from "node:test";
import {
  chooseGeographicChooserLayout,
  placeGeographicAlertChooser,
  valueAtZoom,
} from "../src/components/geographic-chooser-placement.ts";
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

it("the Map View alert chooser keeps clear of the listed alerts' overlays and its badge, as on the System Map", () => {
  const viewportSize = { width: 1200, height: 800 };
  const badgeCenter = { x: 600, y: 400 };
  const badgeSize = { width: 34, height: 34 };
  // A line running down through the badge, and another leaving it to the right.
  const affectedArea = [
    { polyline: [{ x: 600, y: 0 }, { x: 600, y: 800 }], radius: 5 },
    { polyline: [{ x: 600, y: 400 }, { x: 1200, y: 400 }], radius: 5 },
  ];
  const requestedSize = overlapChooserSize(3, viewportSize.width);
  const { chooserSize, layout } = placeGeographicAlertChooser({
    badgeCenter, badgeSize, affectedArea, keepouts: [], viewportSize, requestedSize,
  });
  const box = { left: layout.left, top: layout.top, right: layout.left + chooserSize.width, bottom: layout.top + chooserSize.height };
  assert.equal(layout.coversAffectedArea, false);
  // Clear of both lines (and their 5px half width) and of the badge.
  assert.ok(box.right <= 595 || box.left >= 605);
  assert.ok(box.bottom <= 395 || box.top >= 405);
  // Beside the badge, in the quarter the lines leave free.
  assert.ok(Math.hypot(Math.max(box.left - 617, 583 - box.right, 0), Math.max(box.top - 417, 383 - box.bottom, 0)) <= 64);
});

it("the Map View alert chooser never covers app controls, even to keep the overlays clear", () => {
  // A sidebar and a toolbar; the badge sits on a line just right of the sidebar.
  const viewportSize = { width: 1000, height: 600 };
  const keepouts = [{ left: 0, top: 0, right: 1000, bottom: 80 }, { left: 0, top: 80, right: 380, bottom: 600 }];
  const { chooserSize, layout } = placeGeographicAlertChooser({
    badgeCenter: { x: 420, y: 300 },
    badgeSize: { width: 34, height: 34 },
    affectedArea: [{ polyline: [{ x: 380, y: 300 }, { x: 1000, y: 300 }], radius: 5 }],
    keepouts,
    viewportSize,
    requestedSize: overlapChooserSize(2, viewportSize.width),
  });
  assert.ok(keepouts.every((box) => !intersects(layout, chooserSize, box)));
  assert.equal(layout.coversAffectedArea, false);
  assert.ok(layout.top >= 305 || layout.top + chooserSize.height <= 295);
});

it("valueAtZoom interpolates a paint value between zoom stops and holds it past the ends", () => {
  const stops = [[9, 3.2], [14, 6.5], [17, 9.5]];
  assert.equal(valueAtZoom(stops, 5), 3.2);
  assert.equal(valueAtZoom(stops, 14), 6.5);
  assert.equal(valueAtZoom(stops, 15.5), 8);
  assert.equal(valueAtZoom(stops, 20), 9.5);
});
