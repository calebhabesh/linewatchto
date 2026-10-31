import assert from "node:assert/strict";
import { describe, it } from "node:test";
import geometry from "../src/app/map-geometry/ttc.json" with { type: "json" };
import { networkSegments, stations as mapStations } from "../src/app/linewatch-data.ts";
import { ttcMapContent, ttcRenderedNetworkSegments } from "../src/app/ttc-map-content.ts";
import { mapContentReuser, placeMapOverlapBadges, reuseMapItems } from "../src/app/map-content.ts";

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
      ["planned-preview-p1:p1", "planned-preview", "Weekend closure: Kipling to Jane"],
      ["delay-d1-bidirectional:delay:d1:bidirectional", "delay-static", "delay: Finch to Eglinton"],
      ["suspension-s1-bidirectional:suspension:s1:bidirectional", "suspension", "suspension: Finch to Eglinton"],
    ]);
    assert.deepEqual([...content.outlinePathsByImpact.keys()], ["planned-closure:p1", "delay:d1", "suspension:s1"]);
    assert.deepEqual(content.selectedLineAlerts, []);
  });

  it("previews a current planned closure only while it is selected, and emphasizes the selection", () => {
    const content = ttcMapContent(geometry, scenario({ selection: { kind: "planned-closure", id: "p2" } }));
    assert.ok(content.lineAlerts.some((alert) => alert.key === "planned-preview-p2:p2"));
    assert.deepEqual(content.selectedLineAlerts.map((alert) => [alert.key, alert.kind, alert.impactId]), [
      ["selected:p2", "planned-closure", "p2"],
    ]);
    const suspension = ttcMapContent(geometry, scenario({ selection: { kind: "suspension", id: "s1" } }));
    assert.deepEqual(suspension.selectedLineAlerts.map((alert) => alert.key), ["selected:s1"]);
  });

  it("sizes station alerts by TTC's dots and names their station", () => {
    const content = ttcMapContent(geometry, scenario());
    const kipling = content.stationAlerts.find((alert) => alert.stationId === "kipling");
    assert.equal(kipling.key, "suspension:s1:kipling");
    assert.equal(kipling.label, "No service: Kipling");
    // Kipling is a large terminal: its ring and core are TTC's large sizes.
    assert.deepEqual(kipling.anchors.map(({ id, ringRadius, coreRadius }) => [id, ringRadius, coreRadius]), [["kipling", 56, 48]]);
    assert.deepEqual(kipling.anchors[0].center, geometry.anchors["station-kipling"]);
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

  it("previews a commute's route and flashes both ends", () => {
    const { commutePreview } = ttcMapContent(geometry, scenario());
    assert.equal(commutePreview.label, "Line 1");
    assert.match(commutePreview.pathD, /^M 4547 1808/);
    assert.deepEqual(commutePreview.endpoints.map(({ key, role }) => [key, role]), [
      ["origin:finch:finch", "origin"],
      ["destination:eglinton:eglinton", "destination"],
    ]);
  });

  it("keeps corridors and badge artwork across a selection, so badge placement stays cached", () => {
    const input = scenario();
    const before = ttcMapContent(geometry, input);
    const after = ttcMapContent(geometry, { ...input, selection: { kind: "delay", id: "d1" } });
    assert.equal(after.badgePlacement.artwork, before.badgePlacement.artwork);
    assert.equal(ttcRenderedNetworkSegments(geometry, input), ttcRenderedNetworkSegments(geometry, input));
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
