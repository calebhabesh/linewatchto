import assert from "node:assert/strict";
import { it } from "node:test";
import { regionalOverlapBadgeGroups, regionalOverlapBadges, regionalPlacedOverlapBadges } from "../src/app/regional-map-overlays.ts";
import { REGIONAL_OVERLAP_INDICATOR_SCALE } from "../src/app/regional-map-geometry.ts";
import { BADGE_FEATURE_GAPS, badgeObstacleReach } from "../src/components/overlap-badge-placement.ts";

// Prepared geometry (map-geometry-data.ts) with an unalerted transit line along y = 3000.
const preparedGeometry = (extra = {}) => ({
  format: 1,
  map: "regional",
  source: { svg: "", sha256: "" },
  viewBox: { x: -200, y: -200, width: 17036.959, height: 9031.6719 },
  stations: [],
  anchors: {},
  labels: [],
  lines: [{ id: "regional-route-test-path", points: [0, 3000, 6000, 3000] }],
  artwork: { labels: [], boxes: [], strokes: [] },
  ...extra,
});
const geometry = preparedGeometry();
const corridor = (fromX, toX, y) => Array.from({ length: 21 }, (_unused, index) => ({
  x: fromX + ((toX - fromX) * index) / 20,
  y,
}));
const badge = (id, targets) => ({
  markerId: id,
  label: id,
  anchor: targets[0],
  position: { x: 0, y: 0 },
  placementTargets: targets,
  size: { width: 135, height: 135 },
  impacts: [],
});
const renderedBox = ({ position, size }) => {
  const width = size.width * REGIONAL_OVERLAP_INDICATOR_SCALE;
  const height = size.height * REGIONAL_OVERLAP_INDICATOR_SCALE;
  return { x: position.x - width / 2, y: position.y - height / 2, width, height };
};

it("keeps regional badges beside their corridor and clear of transit lines", () => {
  const [placed] = regionalPlacedOverlapBadges(geometry, [badge("on-line", corridor(2000, 3000, 3000))]);
  const box = renderedBox(placed);
  const lineGap = Math.max(box.y - 3000, 3000 - (box.y + box.height));

  assert.equal(placed.collisionAvoided, true);
  // Same badge-relative spacing as TTC: the 175-wide line's edge plus the shared gap, at twice the scale.
  const lineReach = badgeObstacleReach(87.5, BADGE_FEATURE_GAPS.transitLine, 2);
  assert.ok(lineGap >= lineReach, `badge overlaps the transit line corridor: ${lineGap}`);
  assert.ok(lineGap < lineReach + 80, `badge drifted away from its corridor: ${lineGap}`);
  assert.ok(placed.position.x >= 2000 && placed.position.x <= 3000);
});

it("aligns neighbouring regional badges with the scaled sibling gap", () => {
  const placed = regionalPlacedOverlapBadges(geometry, [
    badge("west", corridor(2400, 2500, 3000)),
    badge("east", corridor(2500, 2600, 3000)),
  ]);
  const [first, second] = placed.map(renderedBox);
  const sameRow = Math.abs(first.y - second.y) < 0.001;
  const sameColumn = Math.abs(first.x - second.x) < 0.001;
  const gap = sameRow
    ? Math.max(second.x - (first.x + first.width), first.x - (second.x + second.width))
    : Math.max(second.y - (first.y + first.height), first.y - (second.y + second.height));

  assert.ok(sameRow || sameColumn, JSON.stringify(placed.map((item) => item.position)));
  assert.ok(Math.abs(gap - 72) < 0.001, `gap ${gap}`);
});

it("does not carry previous badge positions into a new layout", () => {
  const first = regionalPlacedOverlapBadges(geometry, [badge("a", corridor(2000, 3000, 3000))]);
  const moved = regionalPlacedOverlapBadges(geometry, [{ ...badge("a", corridor(2000, 3000, 3000)), position: { x: 9000, y: 500 } }]);
  assert.deepEqual(moved[0].position, first[0].position);
});

it("groups identical overlap sets once while preserving different closure pairs", () => {
  const impact = (cardId) => ({ kind: "planned-closure", cardId });
  const segment = (id, ids) => ({ id, impacts: ids.map(impact) });
  const groups = regionalOverlapBadgeGroups([
    segment("1", ["bloor-stratford", "georgetown-stratford"]),
    segment("2", ["georgetown-stratford", "bloor-stratford"]),
    segment("3", ["bloor-stratford", "bloor-mount-pleasant"]),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].segments.length, 2);
  assert.notEqual(groups[0].signature, groups[1].signature);
});

it("adds a station badge where regional alerts only meet at a station, like the TTC map", () => {
  const impact = (kind, cardId) => ({ kind, cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId] });
  const stationGeometry = preparedGeometry({
    stations: [{
      id: "station-bramalea",
      transform: [1, 0, 0, 1, 0, 0],
      shapes: [{ tag: "circle", id: "station-bramalea", cx: 4000, cy: 2000, r: 40 }],
      anchors: [{ id: "station-bramalea", x: 4000, y: 2000, radius: 40 }],
    }],
  });
  const badges = regionalOverlapBadges(stationGeometry, [
    { id: "ki-a", label: "A to Bramalea", stationAId: "brampton", stationBId: "bramalea", impacts: [impact("planned-closure", "closure-west")] },
    { id: "ki-b", label: "Bramalea to C", stationAId: "bramalea", stationBId: "malton", impacts: [impact("delay", "delay-east")] },
  ], {
    stationNodeImpacts: [],
    stations: [{ id: "bramalea", name: "Bramalea" }],
  });

  assert.equal(badges.length, 1);
  assert.equal(badges[0].label, "Bramalea");
  assert.deepEqual(badges[0].stationPoint, { x: 4000, y: 2000 });
  assert.deepEqual(badges[0].impacts.map((item) => item.cardId).sort(), ["closure-west", "delay-east"]);
});

it("keeps regional badges off station markers", () => {
  // A tall interchange hub (like Union) sits on the alert corridor.
  const hub = { x: 2400, y: 2700, width: 260, height: 800 };
  const [placed] = regionalPlacedOverlapBadges(preparedGeometry({
    artwork: { labels: [], boxes: [{ kind: "artwork", ...hub }], strokes: [] },
  }), [{
    ...badge("hub", [{ x: 2530, y: 3000 }]),
    stationPoint: { x: 2530, y: 3000 },
  }]);
  const box = renderedBox(placed);

  assert.equal(placed.collisionAvoided, true);
  assert.ok(
    box.x + box.width <= hub.x || box.x >= hub.x + hub.width
      || box.y + box.height <= hub.y || box.y >= hub.y + hub.height,
    `badge overlaps the hub: ${JSON.stringify(box)}`,
  );
});
