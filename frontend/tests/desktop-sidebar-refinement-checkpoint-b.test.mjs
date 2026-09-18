import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  mapPointFromViewportPoint,
  transformForViewportResize,
} from "../src/hooks/panZoomMath.ts";

const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");

describe("desktop camera reconciliation (Checkpoint B)", () => {
  it("preserves exact zoom scale on desktop when preserveZoom is true", () => {
    const original = { x: -800, y: -400, scale: 0.85 };
    const prevViewport = { width: 1000, height: 800 };
    const nextViewport = { width: 700, height: 800 };

    const transformed = transformForViewportResize(
      original,
      prevViewport,
      nextViewport,
      0.35,
      0.25,
      0,
      0,
      true,
    );

    assert.equal(transformed.scale, 0.85);
  });

  it("keeps geographic focus centered in the usable map area across docked width changes", () => {
    // Docked width change: 1440px window - 72px rail:
    // Status (380px) -> map viewport width = 988px
    // Commutes (680px) -> map viewport width = 688px
    // Docked mode has 0 overlay inset
    const original = { x: -1200, y: -600, scale: 0.75 };
    const prevViewport = { width: 988, height: 900 };
    const nextViewport = { width: 688, height: 900 };

    const transformed = transformForViewportResize(
      original,
      prevViewport,
      nextViewport,
      0.35,
      0.25,
      0,
      0,
      true,
    );

    // Map point at previous usable center (988 / 2 = 494, 900 / 2 = 450)
    const prevCenter = { x: 494, y: 450 };
    const mapPointAtPrevCenter = mapPointFromViewportPoint(original, prevCenter);

    // Map point at next usable center (688 / 2 = 344, 900 / 2 = 450)
    const nextCenter = { x: 344, y: 450 };
    const mapPointAtNextCenter = mapPointFromViewportPoint(transformed, nextCenter);

    assert.ok(Math.abs(mapPointAtNextCenter.x - mapPointAtPrevCenter.x) < 1e-9);
    assert.ok(Math.abs(mapPointAtNextCenter.y - mapPointAtPrevCenter.y) < 1e-9);

    // Reversible:
    const reversed = transformForViewportResize(
      transformed,
      nextViewport,
      prevViewport,
      0.25,
      0.35,
      0,
      0,
      true,
    );
    assert.ok(Math.abs(reversed.x - original.x) < 1e-9);
    assert.ok(Math.abs(reversed.y - original.y) < 1e-9);
    assert.ok(Math.abs(reversed.scale - original.scale) < 1e-9);
  });

  it("keeps geographic focus centered in the usable map area across overlay width changes", () => {
    // Overlay mode: viewport spans behind sidebar (e.g. 1024px window - 72px rail = 952px)
    // Overlay shifts from Status (380px) to Search (560px)
    const original = { x: -1000, y: -500, scale: 0.65 };
    const viewport = { width: 952, height: 800 };
    const prevOverlayLeft = 380;
    const nextOverlayLeft = 560;

    const transformed = transformForViewportResize(
      original,
      viewport,
      viewport,
      0.3,
      0.3,
      prevOverlayLeft,
      nextOverlayLeft,
      true,
    );

    const prevUsableCenterX = (prevOverlayLeft + viewport.width) / 2; // (380 + 952) / 2 = 666
    const nextUsableCenterX = (nextOverlayLeft + viewport.width) / 2; // (560 + 952) / 2 = 756

    const mapPointAtPrevCenter = mapPointFromViewportPoint(original, { x: prevUsableCenterX, y: 400 });
    const mapPointAtNextCenter = mapPointFromViewportPoint(transformed, { x: nextUsableCenterX, y: 400 });

    assert.ok(Math.abs(mapPointAtNextCenter.x - mapPointAtPrevCenter.x) < 1e-9);
    assert.ok(Math.abs(mapPointAtNextCenter.y - mapPointAtPrevCenter.y) < 1e-9);
  });

  it("keeps geographic focus centered when transitioning between docked and overlay", () => {
    // Window resized from 1250px (docked wide 680px -> viewport 498px) to 1100px (overlay wide 680px -> viewport 1028px, overlayLeft 680px)
    const original = { x: -600, y: -300, scale: 0.5 };
    const dockedViewport = { width: 498, height: 800 };
    const overlayViewport = { width: 1028, height: 800 };

    const transformed = transformForViewportResize(
      original,
      dockedViewport,
      overlayViewport,
      0.2,
      0.4,
      0, // docked has 0 overlayLeft
      680, // overlay has 680px overlayLeft
      true,
    );

    const prevUsableCenter = { x: 498 / 2, y: 400 };
    const nextUsableCenter = { x: (680 + 1028) / 2, y: 400 };

    const mapPointPrev = mapPointFromViewportPoint(original, prevUsableCenter);
    const mapPointNext = mapPointFromViewportPoint(transformed, nextUsableCenter);

    assert.ok(Math.abs(mapPointNext.x - mapPointPrev.x) < 1e-9);
    assert.ok(Math.abs(mapPointNext.y - mapPointPrev.y) < 1e-9);
  });

  it("keeps sidebar geometry out of automatic camera reconciliation", () => {
    assert.doesNotMatch(hookSource, /\.desktop-sidebar-container/);
    assert.doesNotMatch(hookSource, /readDesktopOverlayInsets/);
    assert.match(hookSource, /window\.innerWidth >= 768/);

    assert.doesNotMatch(regionalMapSource, /observer\.observe\(sidebar\)/);
    assert.match(regionalMapSource, /readDesktopOverlayInsets/);
    assert.match(regionalMapSource, /reconcileRegionalViewport/);
  });
});
