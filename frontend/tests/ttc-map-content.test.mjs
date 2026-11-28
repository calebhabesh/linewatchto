import assert from "node:assert/strict";
import { describe, it } from "node:test";
import geometry from "../src/app/map-geometry/ttc.json" with { type: "json" };
import { networkSegments, stations as mapStations } from "../src/app/linewatch-data.ts";
import { ttcMapContent, ttcRenderedNetworkSegments } from "../src/app/ttc-map-content.ts";
import { mapContentReuser, placeMapOverlapBadges, reuseMapItems } from "../src/app/map-content.ts";
import { mapCorridors } from "../src/app/map-corridors.ts";
import { pathPolylinePoints } from "../src/app/map-geometry.ts";

const impact = (kind, cardId) => ({ kind, cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId] });
const summary = (id, name, interchange = false) => ({
  id, name, mapX: 0, mapY: 0, interchange, lineIds: ["line-1"], hasActiveImpact: false, accessStatus: "unknown",
});

// A suspension and a delay share Finch to Eglinton; one planned closure is
// upcoming and one is in effect now.
function scenario(overrides = {}) {
  return {
    networkSegments: networkSegments.map((segment) => segment.id === "line-1-finch-eglinton"
      ? { ...segment, overlay: "suspension", impacts: [impact("suspension", "s1"), impact("delay", "d1")] }
      : segment),
    activeAlerts: [{
      id: "s1", lineId: "line-1", lineNumber: "1", title: "No service", severity: "major", location: "Finch to Eglinton",
      description: "", affectedSegmentIds: ["line-1-finch-eglinton"], shuttle: true, source: "TTC",
    }],
    delays: [{
      id: "d1", lineId: "line-1", lineNumber: "1", title: "Delay", location: "", description: "",
      affectedSegmentIds: ["line-1-finch-eglinton"], source: "TTC",
    }],
    reducedSpeedZones: [],
    plannedClosures: [
      {
        id: "p1", lineId: "line-2", lineNumber: "2", title: "Weekend closure", window: "Sat", location: "Kipling to Jane",
        description: "", previewSegmentIds: ["line-2-kipling-jane"], shuttle: true, source: "TTC", timingStatus: "upcoming",
      },
      {
        id: "p2", lineId: "line-2", lineNumber: "2", title: "Early closure", window: "Now", location: "Jane to Ossington",
        description: "", previewSegmentIds: ["line-2-jane-ossington"], shuttle: false, source: "TTC",
        activeNow: true, timingStatus: "active-now",
      },
    ],
    stationNodeImpacts: [
      { stationId: "kipling", kind: "suspension", cardId: "s1", title: "No service" },
      { stationId: "eglinton", kind: "delay", cardId: "d1", title: "Delay" },
    ],
    mapStations,
    stations: [
      summary("kipling", "Kipling"),
      summary("finch", "Finch"),
      summary("eglinton", "Eglinton", true),
      summary("jane", "Jane"),
      summary("union", "Union", true),
    ],
    selection: null,
    commutePathPreview: {
      id: "c1", commuteId: "commute-1", legId: "outbound", label: "Home", routeLabel: "Line 1",
      segmentIds: ["line-1-finch-eglinton"], stationIds: ["finch", "eglinton"],
    },
    ...overrides,
  };
}

describe("TTC map content", () => {
  it("draws upcoming planned previews under current alerts, the most severe last", () => {
    const content = ttcMapContent(geometry, scenario());
    assert.deepEqual(content.lineAlerts.map((alert) => [alert.key, alert.visualState, alert.label]), [
      ["planned-closure:p1:bidirectional:line-2-kipling-jane", "planned-preview", "Weekend closure: Kipling to Jane"],
      ["delay:d1:bidirectional:line-1-finch-eglinton", "delay-static", "delay: Finch to Eglinton"],
      ["suspension:s1:bidirectional:line-1-finch-eglinton", "suspension", "suspension: Finch to Eglinton"],
    ]);
    assert.deepEqual([...content.outlinePathsByImpact.keys()], ["planned-closure:p1", "delay:d1", "suspension:s1"]);
    assert.deepEqual(content.selectedLineAlerts, []);
  });

  it("previews a current planned closure only while it is selected, and emphasizes the selection", () => {
    const content = ttcMapContent(geometry, scenario({ selection: { kind: "planned-closure", id: "p2" } }));
    const preview = "planned-closure:p2:bidirectional:line-2-jane-ossington";
    assert.ok(content.lineAlerts.some((alert) => alert.key === preview));
    // The selection emphasizes the drawn alerts it names (one list for every map).
    assert.deepEqual(content.selectedLineAlerts.map((alert) => [alert.key, alert.kind, alert.impactId]), [
      [preview, "planned-closure", "p2"],
    ]);
    const suspension = ttcMapContent(geometry, scenario({ selection: { kind: "suspension", id: "s1" } }));
    assert.deepEqual(suspension.selectedLineAlerts.map((alert) => alert.key), ["suspension:s1:bidirectional:line-1-finch-eglinton"]);
  });

  it("sizes station alerts from each dot's prepared radius and names their station", () => {
    const content = ttcMapContent(geometry, scenario());
    const kipling = content.stationAlerts.find((alert) => alert.stationId === "kipling");
    const eglinton = content.stationAlerts.find((alert) => alert.stationId === "eglinton");
    assert.equal(kipling.key, "suspension:s1:kipling");
    assert.equal(kipling.label, "No service: Kipling");
    // The shared ratios (map-content-rules.ts): core 26/32 of the dot, ring
    // 38/32. Kipling and Eglinton are drawn large (r 58.84): the core stays
    // at TTC's 48 and the ring now clears the dot as a regular dot's does
    // (70, was 56 inside the dot's outline).
    const sizes = (alert) => alert.anchors.map(({ id, ringRadius, coreRadius }) => [id, Math.round(ringRadius), Math.round(coreRadius)]);
    assert.deepEqual(sizes(kipling), [["kipling", 70, 48]]);
    assert.deepEqual(sizes(eglinton), [["eglinton", 70, 48]]);
    assert.deepEqual(kipling.anchors[0].center, geometry.anchors["station-kipling"]);
  });

  it("previews an upcoming closure that a segment impact names, in planned blue", () => {
    const content = ttcMapContent(geometry, scenario({
      networkSegments: networkSegments.map((segment) => segment.id === "line-2-kipling-jane"
        ? { ...segment, overlay: "delay", impacts: [impact("planned-closure", "p1")] }
        : segment),
    }));
    assert.deepEqual(
      content.lineAlerts.filter((alert) => alert.impactId === "p1").map((alert) => [alert.visualState, alert.label]),
      [["planned-preview", "Weekend closure: Kipling to Jane"]],
    );
  });

  it("badges alerts that share a stretch of line", () => {
    const content = ttcMapContent(geometry, scenario());
    assert.deepEqual(content.overlapBadges.map((badge) => [badge.markerId, badge.layoutId, badge.label, badge.impacts.map((item) => item.cardId)]), [
      ["line-1-finch-eglinton", "segment:line-1-finch-eglinton", "Finch to Eglinton", ["s1", "d1"]],
    ]);
    assert.equal(content.badgePlacement.badgeScale, 1);
    const [placed] = placeMapOverlapBadges(content, { unit: 1, mapBounds: { x: 0, y: 0, width: 8250, height: 4000 } });
    assert.equal(placed.markerId, "line-1-finch-eglinton");
    assert.ok(placed.connector, "a placed badge points back at its alerts");
  });

  it("previews a commute's route and flashes both ends, sized from each dot", () => {
    const { commutePreview } = ttcMapContent(geometry, scenario());
    assert.equal(commutePreview.label, "Line 1");
    assert.match(commutePreview.pathD, /^M 4547 1808/);
    // TTC's 34-unit dot and 38-unit flash on its 32-unit dot, as ratios of
    // each dot (map-content-rules.ts). Finch and Eglinton are drawn large
    // (r 58.84), so their ends grow with the dot (the flash was 48).
    assert.deepEqual(commutePreview.endpoints.map(({ key, role, dotRadius, flashRadius }) => (
      [key, role, Math.round(dotRadius), Math.round(flashRadius)]
    )), [
      ["origin:finch:finch", "origin", 63, 70],
      ["destination:eglinton:eglinton", "destination", 63, 70],
    ]);
  });

  it("draws a line-wide alert with no listed segments over its line's route", () => {
    const content = ttcMapContent(geometry, scenario({
      activeAlerts: [{
        id: "w4", lineId: "line-4", lineNumber: "4", title: "No service on Line 4", severity: "suspension", location: "",
        description: "", affectedSegmentIds: [], shuttle: true, source: "TTC",
      }],
    }));
    const lineWide = content.lineAlerts.filter((alert) => alert.impactId === "w4");
    assert.deepEqual(lineWide.map((alert) => [alert.kind, alert.lineId, alert.visualState, alert.label]), [
      ["suspension", "line-4", "suspension", "suspension: 4 No service on Line 4"],
    ]);
    const line4 = networkSegments.filter((segment) => segment.lineId === "line-4").map((segment) => segment.id).sort();
    assert.deepEqual([...lineWide[0].segmentIds].sort(), line4);
  });

  it("keeps corridors and badge artwork across a selection, so badge placement stays cached", () => {
    const input = scenario();
    const before = ttcMapContent(geometry, input);
    const after = ttcMapContent(geometry, { ...input, selection: { kind: "delay", id: "d1" } });
    assert.equal(after.badgePlacement.artwork, before.badgePlacement.artwork);
    assert.equal(ttcRenderedNetworkSegments(geometry, input), ttcRenderedNetworkSegments(geometry, input));
  });

  describe("station overlap badges at Spadina's two dots", () => {
    // Production's adjacent segments name Spadina's Line 1 and Line 2 dots
    // (V7 topology); Line 1 and Line 2 run through separate dots there.
    const spadina = (id, lineId, stationAId, stationBId, anchors, cardId) => ({
      id, lineId, label: `${stationAId} to ${stationBId}`, stationAId, stationBId,
      stationAAnchorId: anchors.a, stationBAnchorId: anchors.b, pathD: "",
      overlay: "delay", impacts: [impact("delay", cardId)],
    });
    const delay = (id, lineId) => ({
      id, lineId, lineNumber: lineId.slice(-1), title: id, location: "", description: "", affectedSegmentIds: [], source: "TTC",
    });
    const run = (segments, delays, stationNodeImpacts = [], activeAlerts = []) => ttcMapContent(geometry, scenario({
      networkSegments: segments,
      activeAlerts,
      delays,
      plannedClosures: [],
      stationNodeImpacts,
      stations: [summary("spadina", "Spadina", true), summary("dupont", "Dupont"), summary("bathurst", "Bathurst")],
      commutePathPreview: null,
    })).overlapBadges.map((badge) => ({ label: badge.label, layoutId: badge.layoutId, cards: badge.impacts.map((item) => item.cardId).sort() }));
    const line1 = spadina("line-1-dupont-spadina", "line-1", "dupont", "spadina", { a: "station-dupont", b: "station-spadina-1" }, "line-1-delay");
    const line2 = spadina("line-2-bathurst-spadina", "line-2", "bathurst", "spadina", { a: "station-bathurst", b: "station-spadina-2" }, "line-2-delay");
    const delays = [delay("line-1-delay", "line-1"), delay("line-2-delay", "line-2")];

    it("draws both segments, each ending on its own dot", () => {
      assert.deepEqual(
        ttcRenderedNetworkSegments(geometry, { networkSegments: [line1, line2], mapStations }).map((segment) => segment.id),
        [line1.id, line2.id],
      );
    });

    it("gives Line 1 and Line 2 alerts that only meet at Spadina no badge", () => {
      assert.deepEqual(run([line1, line2], delays), []);
    });

    it("badges a Line 2 station alert with the Line 2 alert, on the Line 2 dot", () => {
      assert.deepEqual(
        run(
          [line1, line2],
          delays,
          [{ stationId: "spadina", kind: "suspension", cardId: "spadina-line-2", title: "No service at Spadina" }],
          [{
            id: "spadina-line-2", lineId: "line-2", lineNumber: "2", title: "No service at Spadina", severity: "major",
            location: "Spadina", description: "", affectedSegmentIds: [], shuttle: false, source: "TTC",
          }],
        ),
        [{ label: "Spadina", layoutId: "station:spadina:station-spadina-2", cards: ["line-2-delay", "spadina-line-2"] }],
      );
    });
  });
});

describe("TTC alert corridors", () => {
  it("runs down Line 1's U without folding back at St Andrew or King", () => {
    // Each station's guided path and track path overlap past the station by
    // about 32 units; joined as they were, the path folded back there and
    // bunched its glyphs.
    const lineSegment = (stationAId, stationBId, guidePathId = null, guidePathReversed = false) => ({
      id: `line-1-${stationAId}-${stationBId}`, lineId: "line-1", label: `${stationAId} to ${stationBId}`,
      stationAId, stationBId, stationAAnchorId: `station-${stationAId}`, stationBAnchorId: `station-${stationBId}`,
      guidePathId, guidePathReversed, pathD: "", overlay: "suspension", impacts: [],
    });
    const drawn = ttcRenderedNetworkSegments(geometry, {
      networkSegments: [
        lineSegment("osgoode", "st-andrew"),
        lineSegment("st-andrew", "union", "seg-line-1-st-andrew-union"),
        lineSegment("king", "union", "seg-line-1-union-king", true),
        lineSegment("queen", "king"),
      ],
      mapStations,
    });
    assert.equal(drawn.length, 4);
    const [corridor, ...rest] = mapCorridors(drawn, "bidirectional");
    assert.deepEqual(rest, []);
    assert.equal(corridor.pathD.match(/M/g).length, 1);
    const points = pathPolylinePoints(corridor.pathD);
    for (let index = 1; index < points.length - 1; index++) {
      const [a, b, c] = points.slice(index - 1, index + 2);
      const turn = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y))
        / (Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y));
      assert.ok(turn > -0.5, `folds back at ${b.x}, ${b.y}`);
    }
  });
});

describe("map content reuse", () => {
  it("keeps unchanged items and returns the previous list when nothing changed", () => {
    const a = { key: "a", value: 1 };
    const b = { key: "b", value: 2 };
    const previous = [a, b];
    assert.equal(reuseMapItems(previous, [{ key: "a", value: 1 }, { key: "b", value: 2 }]), previous);
    const next = reuseMapItems(previous, [{ key: "a", value: 1 }, { key: "b", value: 3 }]);
    assert.notEqual(next, previous);
    assert.equal(next[0], a);
    assert.notEqual(next[1], b);
  });

  it("returns the previous content for a rebuild that draws the same", () => {
    const reuse = mapContentReuser();
    const first = reuse(ttcMapContent(geometry, scenario()));
    assert.equal(reuse(ttcMapContent(geometry, scenario())), first);
    const selected = reuse(ttcMapContent(geometry, scenario({ selection: { kind: "suspension", id: "s1" } })));
    assert.notEqual(selected, first);
    assert.equal(selected.lineAlerts, first.lineAlerts);
    assert.equal(selected.stationAlerts, first.stationAlerts);
  });
});
