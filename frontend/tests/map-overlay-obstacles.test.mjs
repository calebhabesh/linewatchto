import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lineAlertBadgeObstacleRadius,
  lineAlertOutlineHalfWidth,
  stationAlertOutlineRadius,
  stationAlertPlacementAnchors,
  stationAlertPlacementObstacles,
} from "../src/components/map-overlays/overlay-obstacles.ts";
import { MAP_HOVER_OUTLINE_WIDTHS } from "../src/components/map-overlays/overlay-plane.ts";
import {
  STATION_ALERT_RING_STROKE_HALF_WIDTH,
  stationAlertAnchorReach,
} from "../src/components/map-overlays/station-alert-model.ts";
import { BADGE_FEATURE_GAPS, badgeObstacleReach } from "../src/components/overlap-badge-placement.ts";

const GO_UP_UNIT = 196 / 96;
const circle = { id: "a", center: { x: 10, y: 20 }, coreRadius: 26, ringRadius: 38, beaconRadius: 57.2 };
const pill = { x: 0, y: 0, width: 200, height: 80, rx: 40, ry: 40, transform: "", scale: 1, stroke: "", strokeWidth: "" };

describe("badge and connector clearances from the shared overlay sizes", () => {
  it("ends connectors on a line alert's hover outline, at each map's overlay unit", () => {
    assert.equal(lineAlertOutlineHalfWidth(1), MAP_HOVER_OUTLINE_WIDTHS.outer / 2);
    assert.equal(lineAlertOutlineHalfWidth(GO_UP_UNIT), MAP_HOVER_OUTLINE_WIDTHS.outer * GO_UP_UNIT / 2);
  });

  it("keeps badges the alert-overlay gap from that outline, scaled by badge size", () => {
    assert.equal(
      lineAlertBadgeObstacleRadius(1, 1),
      badgeObstacleReach(MAP_HOVER_OUTLINE_WIDTHS.outer / 2, BADGE_FEATURE_GAPS.alertOverlay),
    );
    assert.equal(
      lineAlertBadgeObstacleRadius(GO_UP_UNIT, 2),
      badgeObstacleReach(MAP_HOVER_OUTLINE_WIDTHS.outer * GO_UP_UNIT / 2, BADGE_FEATURE_GAPS.alertOverlay, 2),
    );
  });

  it("ends connectors on a station alert's hovered ring, or a pill's outline", () => {
    assert.equal(stationAlertOutlineRadius(circle, 1), 38 + STATION_ALERT_RING_STROKE_HALF_WIDTH);
    assert.equal(stationAlertOutlineRadius(circle, 2), 38 + STATION_ALERT_RING_STROKE_HALF_WIDTH * 2);
    assert.equal(stationAlertOutlineRadius({ ...circle, pill }, 2), stationAlertAnchorReach({ ...circle, pill }, 2));
  });

  it("keeps badges off a station alert's whole drawing, beacon included", () => {
    const [anchor] = stationAlertPlacementAnchors(
      [{ key: "k", kind: "delay", impactId: "d1", stationId: "s", label: "", anchors: [circle] }],
      1,
      1,
    );
    assert.equal(anchor.impactKey, "delay:d1");
    assert.equal(anchor.obstacleRadius, badgeObstacleReach(57.2, BADGE_FEATURE_GAPS.alertOverlay));
    assert.ok(anchor.obstacleRadius > anchor.outlineRadius);
    assert.deepEqual(stationAlertPlacementObstacles([anchor]), [{ polyline: [{ x: 10, y: 20 }], radius: anchor.obstacleRadius }]);
  });

  it("maps anchors into the placer's coordinates and skips alerts that are fading out", () => {
    const anchors = stationAlertPlacementAnchors(
      [
        { key: "k", kind: "delay", impactId: "d1", stationId: "s", label: "", anchors: [circle] },
        { key: "x", kind: "delay", impactId: "gone", stationId: "s", label: "", anchors: [circle], exiting: true },
      ],
      GO_UP_UNIT,
      2,
      ({ x, y }) => ({ x: x + 100, y: y + 200 }),
    );
    assert.equal(anchors.length, 1);
    assert.deepEqual(anchors[0].center, { x: 110, y: 220 });
  });
});
