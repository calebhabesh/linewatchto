import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  affectedOutlinesOnScreen,
  layoutMapOverlapBadges,
  mapBadgeAlertCorridors,
  overlapBadgeTargetsAlong,
} from "../src/components/map-overlays/overlap-badge-layout.ts";
import { STATION_BADGE_TARGET_RADIUS, lineAlertOutlineHalfWidth } from "../src/components/map-overlays/overlay-obstacles.ts";

const alert = (impactId, pathD, overrides = {}) => ({
  key: impactId, kind: "delay", impactId, lineId: "line", pathD,
  travelDirection: "bidirectional", visualState: "delay-static", label: impactId, segmentIds: [], ...overrides,
});
const noArtwork = { obstacles: [], transitLines: [], transitLineHalfWidth: 40, connectorKeepOut: [], connectorCrossings: [] };

describe("shared overlap badge layout", () => {
  it("samples each alert's corridor densely, not only at its corners", () => {
    const [corridor] = mapBadgeAlertCorridors([alert("a", "M 0 0 L 2000 0"), alert("gone", "M 0 0 L 9 9", { exiting: true })], 2);
    assert.equal(corridor.impactKey, "delay:a");
    assert.deepEqual(corridor.polyline, [{ x: 0, y: 0 }, { x: 2000, y: 0 }]);
    const gaps = corridor.samples.slice(1).map((point, index) => point.x - corridor.samples[index].x);
    assert.ok(Math.max(...gaps) <= lineAlertOutlineHalfWidth(2) + 1e-9);
    // Badge targets follow the badge's size.
    assert.ok(overlapBadgeTargetsAlong("M 0 0 L 320 0", 2).length < overlapBadgeTargetsAlong("M 0 0 L 320 0", 1).length);
  });

  it("puts a station badge beside its station, with the outlines its chooser keeps clear", () => {
    const corridors = mapBadgeAlertCorridors([alert("a", "M 0 2000 L 4000 2000")], 1);
    const stationAlerts = [{ impactKey: "delay:b", center: { x: 2000, y: 2000 }, obstacleRadius: 60, outlineRadius: 40 }];
    const layouts = layoutMapOverlapBadges({
      badges: [{
        id: "station",
        impacts: [{ kind: "delay", cardId: "a" }, { kind: "delay", cardId: "b" }],
        size: { width: 60, height: 60 },
        targets: [{ x: 2000, y: 2000 }],
        stationPoint: { x: 2000, y: 2000 },
      }],
      artwork: noArtwork,
      corridors,
      stationAlerts,
      stationDots: [],
      mapBounds: { x: 0, y: 0, width: 4000, height: 4000 },
      unit: 1,
      badgeScale: 1,
    });
    const layout = layouts.get("station");
    const distance = Math.hypot(layout.position.x - 2000, layout.position.y - 2000);
    assert.ok(distance > 60 && distance <= STATION_BADGE_TARGET_RADIUS, `badge ${distance} from its station`);
    assert.deepEqual(layout.affectedOutlines.map((outline) => ("center" in outline ? "station" : "line")), ["line", "station"]);
  });

  it("maps affected outlines to the screen", () => {
    const area = affectedOutlinesOnScreen(
      [{ polyline: [{ x: 1, y: 2 }], halfWidth: 10 }, { center: { x: 3, y: 4 }, radius: 5 }],
      ({ x, y }) => ({ x: x * 2, y: y * 2 }),
      2,
    );
    assert.deepEqual(area, [
      { polyline: [{ x: 2, y: 4 }], radius: 20 },
      { polyline: [{ x: 6, y: 8 }], radius: 10 },
    ]);
  });
});
